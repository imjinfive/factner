import React from 'react';
import {createRoot} from 'react-dom/client';
import '../styles.css';
import '../funnel-shell.css';
import BidApp from './BidApp';
createRoot(document.getElementById('root')).render(<BidApp/>);
