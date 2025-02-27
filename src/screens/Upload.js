import React, { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, ScrollView, Alert } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { getFirestore, addDoc, collection, doc, getDoc, writeBatch } from 'firebase/firestore';
import { initializeApp } from 'firebase/app';
import * as DocumentPicker from 'expo-document-picker';
import { auth, firestore } from '../../firebase-config';
import { CONVERT_API_KEY, GEMINI_KEY} from '../../api-keys'
import { ColorPicker } from 'react-native-color-picker'
import Slider from '@react-native-community/slider';
import axios from 'axios';
import tinycolor from 'tinycolor2';
import Header from '../components/Header';
import NavBar from '../components/NavBar';
import { Picker } from '@react-native-picker/picker';

const PHILIPPINE_LANGUAGES = [
  'English',
  'Filipino (Tagalog)',
  'Cebuano',
  'Ilocano',
  'Hiligaynon (Ilonggo)',
  'Bicolano',
  'Waray',
  'Kapampangan',
  'Pangasinan',
  'Chavacano',
  'Tausug',
  'Maranao'
];

export default function Upload({navigation}) {

  const [name, setName] = useState('');
  const [texts, setTexts] = useState([]);
  const [reviewerId, setReviewerId] = useState('');
  const [plainText, setPlainText] = useState('');
  const [cardColor, setCardColor] = useState('#C0A080');
  const [chosenLanguage, setChosenLanguage] = useState('English');
  
  const colorPickerRef = useRef(null);
  const [files, setFiles] = useState([]);

  const extractTextFromPDF = async (file) => {
    try {

      const formData = new FormData();
      formData.append('File', {
        uri: file.uri,
        type: 'application/pdf',
        name: file.name
      });
      formData.append('StoreFile', 'true');

      const response = await axios({
        method: 'post',
        url: 'https://v2.convertapi.com/convert/pdf/to/txt',
        headers: {
          'Authorization': `Bearer ${CONVERT_API_KEY}`,
          'Content-Type': 'multipart/form-data'
        },
        data: formData
      });


      if (response.data && response.data.Files && response.data.Files.length > 0) {
        console.log(response.data);
        const textFileUrl = response.data.Files[0].Url;
        const textResponse = await axios.get(textFileUrl);
        console.log('Text content:', textResponse.data);
        return textResponse.data;
      }

      throw new Error('No text content in response');

    } catch (error) {
      console.error('Error converting PDF:', error);
      if (error.response) {
        console.error('Response data:', error.response.data);
        console.error('Response status:', error.response.status);
        console.error('Response headers:', error.response.headers);
      }
      throw error;
    }
  };

  const generateFlashcards = async (text) => {
    try {
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_KEY}`,
        {
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: `In the language/dialect ${chosenLanguage}, create multiple flashcards consisting of a question and an answer based on the following content (5 minimum) and output them as JSON:\n\n${text}`,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 1024,
            responseMimeType: 'application/json',
          },
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
  
      if (response.data && response.data.candidates && response.data.candidates.length > 0) {
        const generatedFlashcards = JSON.parse(response.data.candidates[0].content.parts[0].text);
        return generatedFlashcards;
      }
  
      throw new Error('Invalid response from Gemini API');
    } catch (error) {
      console.error('Error generating flashcards:', error);
      throw error;
    }
  };
  
  const storeFlashcards = async (flashcards, reviewerUid) => {
    try {
      const db = getFirestore();
      const batch = writeBatch(db);
  
      flashcards.forEach((flashcard) => {
        if (flashcard.question && flashcard.answer) { // Check for 'question' and 'answer' keys
          const docRef = doc(collection(db, 'flashcards'));
          batch.set(docRef, {
            front: flashcard.question, // Map 'question' to 'front'
            back: flashcard.answer,   // Map 'answer' to 'back'
            reviewerUid: reviewerUid,
            userUid: auth.currentUser.uid,
            createdAt: new Date(),
          });
        } else {
          console.error('Invalid flashcard data:', flashcard);
        }
      });
  
      await batch.commit();
      console.log('Flashcards stored successfully');
    } catch (error) {
      console.error('Error storing flashcards:', error);
    }
  };

  const generateAiQuizSet = async (reviewerText, reviewerId) => {
    try {

      console.log("Confirm: " + reviewerText);

        // 2. Generate quiz questions using Gemini
        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_KEY}`,
            {
                contents: [{
                    role: "user",
                    parts: [{
                        text: `Based on this knowledge: "${reviewerText}", generate 5 multiple choice questions and answers written in the language/dialect ${chosenLanguage}. 
                        Return the response in this exact JSON format:
                        [
                            {
                                "question": "the question text",
                                "option1": "first option",
                                "option2": "second option",
                                "option3": "third option",
                                "option4": "fourth option",
                                "answer": "the correct option"
                            }
                        ]
                        Ensure the response is valid JSON and the answer exactly matches one of the options.`
                    }]
                }],
                generationConfig: {
                    temperature: 0.7,  // Reduced for more consistent formatting
                    topK: 40,
                    topP: 0.95,
                    maxOutputTokens: 8192,
                    responseMimeType: "text/plain"
                }
            },
            {
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        );

        // Log the raw response text
        console.log("Raw Gemini Response:", response.data.candidates[0].content.parts[0].text);

        if (response.data.candidates && response.data.candidates[0].content.parts[0].text) {
            let responseText = response.data.candidates[0].content.parts[0].text;
            
            // Clean up the response text if needed
            responseText = responseText.trim();
            if (responseText.startsWith('```json')) {
                responseText = responseText.replace('```json', '').replace('```', '').trim();
            }

            try {
                const generatedQuestions = JSON.parse(responseText);
                console.log("Parsed Questions:", generatedQuestions);

                // 3. Store each question separately in Firestore
                for (const question of generatedQuestions) {
                    await addDoc(collection(firestore, 'quiz'), {
                        question: question.question,
                        option1: question.option1,
                        option2: question.option2,
                        option3: question.option3,
                        option4: question.option4,
                        answer: question.answer,
                        reviewerUid: reviewerId,
                        createdAt: new Date()
                    });
                }

            } catch (parseError) {
                console.error('JSON Parse Error:', parseError);
                console.error('Failed to parse text:', responseText);
            }
        }
    } catch (error) {
        console.error('Error generating quiz:', error);
        if (error.response) {
            console.error('API Error Response:', error.response.data);
        }
    }
};
  

  const handleCreateReviewer = async () => {
    try {
      let newTexts = [];

      // Handle plaintext if it exists
      if (plainText.trim()) {
        newTexts.push(plainText.trim());
      }

      // Handle PDF files
      if (files.length > 0) {
        const pdfPromises = files.map(async (file) => {
          try {
            const extractedText = await extractTextFromPDF(file);
            if (extractedText) {
              return extractedText;
            }
          } catch (error) {
            console.error(`Error extracting text from PDF ${file.name}:`, error);
            Alert.alert('Error', `Failed to extract text from PDF ${file.name}`);
            return null;
          }
        });

        // Wait for all PDF conversions to complete
        const extractedTexts = await Promise.all(pdfPromises);
        
        // Filter out any null values from failed conversions
        const validTexts = extractedTexts.filter(text => text !== null);
        newTexts = [...newTexts, ...validTexts];
      }

      // Update state with all new texts at once
      setTexts(prevTexts => [...prevTexts, ...newTexts]);

      const joinedTexts = newTexts.join('\n');

      // Generate AI description using Gemini
      const aiDescription = await generateAIDescription(joinedTexts);

      // Generate flashcards using Gemini API
      const flashcards = await generateFlashcards(joinedTexts);

      // Store reviewer data with AI description
      const reviewerDocRef = await storeReviewerData(name, joinedTexts, cardColor, new Date(), auth.currentUser.uid, aiDescription);
      
      // Set reviewerId in state
      setReviewerId(reviewerDocRef.id);

      // Store flashcards in Firestore
      await storeFlashcards(flashcards, reviewerDocRef.id);

      // Generate quiz set
      await generateAiQuizSet(joinedTexts, reviewerDocRef.id);

      // Generate summary using Gemini API
      const summary = await generateSummary(joinedTexts);

      // Store summary in Firestore
      await storeSummary(summary, reviewerDocRef.id);


      // Clear inputs after processing
      setPlainText('');
      setFiles([]);

    } catch (error) {
      console.error('Error in handleCreateReviewer:', error);
      Alert.alert('Error', 'Failed to create reviewer');
    }
  };

  const generateAIDescription = async (text) => {
    try {
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_KEY}`,
        {
          contents: [{
            role: "user",
            parts: [{
              text: `In the language/dialect ${chosenLanguage}, please provide a brief description (1 sentence) summarizing the main topic and key points of the following text: ${text}`
            }]
          }],
          generationConfig: {
            temperature: 1,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 8192,
            responseMimeType: "text/plain"
          }
        },
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data.candidates && response.data.candidates[0].content.parts[0].text) {
        return response.data.candidates[0].content.parts[0].text;
      }
      
      return '';
    } catch (error) {
      console.error('Error generating AI description:', error);
      return '';
    }
  };

  const storeReviewerData = async (name, text, cardColor, dateCreated, userUid, aiDescription) => {
    try {
      const db = getFirestore();
      const docRef = await addDoc(collection(db, 'reviewer'), {
        name: name || "Untitled",
        text: text,
        cardColor: cardColor,
        dateCreated: dateCreated,
        userUid: userUid,
        aiDescription: aiDescription,
        translateTo: chosenLanguage
      });

      console.log("Upload Screen - Created reviewerId:", docRef.id);

      navigation.navigate('ModeSelect', { 
        reviewerId: docRef.id
      });
      
      return docRef;
    } catch (error) {
      console.error('Error storing reviewer data:', error);
      Alert.alert('Error', 'Failed to store reviewer data');
    }
  };

  const generateSummary = async (text) => {
    try {
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_KEY}`,
        {
          contents: [{
            role: "user",
            parts: [{
              text: `In the language/dialect ${chosenLanguage}, please provide a brief summary of the following text: ${text}`

            }]
          }],
          generationConfig: {
            temperature: 1,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 8192,
            responseMimeType: "text/plain"
          }
        },
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data.candidates && response.data.candidates[0].content.parts[0].text) {
        return response.data.candidates[0].content.parts[0].text;
      }
      
      return '';
    } catch (error) {
      console.error('Error generating summary:', error);
      return '';
    }
  };

  const storeSummary = async (summary, reviewerId) => {
    try {
      const db = getFirestore();
      await addDoc(collection(db, 'summary'), {
        reviewerId: reviewerId,
        summary: summary,
        createdAt: new Date(),
      });

      console.log('Summary stored successfully');
    } catch (error) {
      console.error('Error storing summary:', error);
    }
  };

  const saveColorToDatabase = (color) => {
    console.log("Saving Color to Database:", color);
    // Database save logic here
  };
  

  const handleColorSelected = (color) => {
    console.log("Raw Color Data from Picker:", color);
  
    // Use hue directly if it's already in degrees (0-360)
    const hsv = {
      h: color.h,  // Assume color.h is already in degrees
      s: color.s,  // Saturation remains as is (0-1)
      v: color.v,  // Value remains as is (0-1)
    };
  
    console.log("Normalized HSV Values:", hsv);
  
    // Convert HSV to Hex
    const hexColor = tinycolor(hsv).toHexString();
  
    console.log("Converted Hex Color:", hexColor);
  
    // Update state and save to database
    setCardColor(hexColor);
    console.log("State Updated with Color:", hexColor);
  
    saveColorToDatabase(hexColor);
  };
  
  
  

  const handleFileSelection = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf'],
        multiple: true,
        copyToCacheDirectory: true
      });

      if (!result.canceled) {
        const selectedFiles = result.assets;
        setFiles(prevFiles => [...prevFiles, ...selectedFiles]);
        Alert.alert('Success', `Selected ${selectedFiles.length} file(s)`);
      }
    } catch (error) {
      Alert.alert('Error', 'Error selecting files: ' + error.message);
    }
  };

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <Header/>
        
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Reviewer Name</Text>
          <TextInput
            style={styles.input}
            placeholder="Data Structures & Algorithms, etc..."
            value={name}
            onChangeText={setName}
            placeholderTextColor={styles.placeholder.color}
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Choose Language/Dialect</Text>
          <View style={styles.pickerContainer}>
            <Picker
              selectedValue={chosenLanguage}
              onValueChange={(itemValue) => setChosenLanguage(itemValue)}
              style={styles.picker}
            >
              {PHILIPPINE_LANGUAGES.map((language) => (
                <Picker.Item key={language} label={language} value={language} />
              ))}
            </Picker>
          </View>
        </View>

        <View style={styles.uploadContainer}>

          <View>

            <Text style={styles.label}>File Upload</Text>
            <Text style={styles.subLabel}>Add your documents here.</Text>
            <View style={styles.dropZone}>
              <Icon name="file" size={40} color="#4285F4" />
              <Text style={styles.dropText}>
                {files.length > 0 
                  ? `Selected ${files.length} file(s):\n${files.map(file => file.name).join('\n')}` 
                  : 'No files selected'}
              </Text>
              <TouchableOpacity 
                style={styles.browseButton}
                onPress={handleFileSelection}
              >
                <Text style={styles.browseText}>Browse files</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.supportText}>Only supports pdf files</Text>

          </View>

            <View style={{marginTop: 20}}>

            <Text style={styles.label}>Plain Text</Text>
            <Text style={styles.subLabel}>Paste your text here.</Text>
            <TextInput
              style={styles.inputPlainText}
              placeholder="Paste here..."
              value={plainText}
              onChangeText={setPlainText}
              multiline={true}
              placeholderTextColor={styles.placeholder.color}
            />
            {texts.length > 0 && (
              <Text style={styles.subLabel}>
                Added texts: {texts.length}
              </Text>
            )}

          </View>

        </View>

        <View style={styles.colorPickerContainer}>
          <Text style={styles.label}>Choose Card Color</Text>
          <ColorPicker
            ref={colorPickerRef}
            onColorChange={handleColorSelected}
            style={styles.colorPicker}
            sliderComponent={Slider}
          />
        </View>

        <TouchableOpacity style={styles.createReviewerButton} onPress={handleCreateReviewer}>
          <Text style={styles.createReviewerText}>Create Reviewer</Text>
        </TouchableOpacity>
        
      </ScrollView>
      <View style={{marginTop: "50"}}></View>
      <NavBar navigation={navigation}/>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'white',
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  subLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  inputPlainText: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    height: 120
  },
  uploadContainer: {
    marginBottom: 20,
  },
  dropZone: {
    borderWidth: 2,
    borderColor: '#ddd',
    borderStyle: 'dashed',
    borderRadius: 8,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fafafa',
    minHeight: 200,
  },
  dropText: {
    fontSize: 14,
    color: '#666',
    marginTop: 10,
  },
  orText: {
    fontSize: 14,
    color: '#666',
    marginVertical: 10,
  },
  browseButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#666',
    borderRadius: 20,
  },
  browseText: {
    color: '#666',
  },
  supportText: {
    fontSize: 12,
    color: '#666',
    marginTop: 8,
  },
  customizeContainer: {
    marginBottom: 20,
  },
  colorSlider: {
    height: 40,
    backgroundColor: '#f0f0f0',
    borderRadius: 20,
    marginTop: 10,
  },
  createButton: {
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 20,
  },
  createButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  createReviewerButton: {
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 20,
    backgroundColor: '#B2A561',
  },
  createReviewerText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  placeholder: {
    color: 'rgba(0, 0, 0, 0.5)',
  },
  colorPickerContainer: {
    marginVertical: 20,
    height: 200,
  },
  colorPicker: {
    flex: 1,
    borderRadius: 8,
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    backgroundColor: '#fff',
    marginBottom: 20,
  },
  picker: {
    height: 50,
    width: '100%',
  },
});