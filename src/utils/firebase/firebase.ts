import { initializeApp } from 'firebase/app';

const firebaseConfig = {
  apiKey: "AIzaSyDjVL2jHMNBdxtjLaDB5gntkSuZQs-wfOM",
  authDomain: "async-games.firebaseapp.com",
  projectId: "async-games",
  storageBucket: "async-games.appspot.com",
  messagingSenderId: "881657298890",
  appId: "1:881657298890:web:ac8f8340df9d3a51565933",
  measurementId: "G-3KW1568JC5"
};

// Initialize Firebase
const firebaseApp = initializeApp(firebaseConfig);

export default firebaseApp;
