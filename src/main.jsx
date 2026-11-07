import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import './operation-focus.css';
import './responsive-system.css';
import './mobile-v42.css';
import './button-foundation.css';
import './ios-input-focus.css';
import './ios-edge-to-edge.css';

if (window.navigator.standalone === true) document.documentElement.classList.add('ti-ios-standalone');

createRoot(document.getElementById('root')).render(
  <React.StrictMode><App /></React.StrictMode>
);
