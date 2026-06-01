import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Device UI Optimizer
const initDeviceProfile = () => {
  const ua = navigator.userAgent;
  const isWindows = ua.includes('Windows');
  const isAndroid = ua.includes('Android');
  const isTablet = /(ipad|tablet|(android(?!.*mobile))|(windows(?!.*phone)(.*touch))|kindle|playbook|silk|(puffin(?!.*(IP|AP|WP))))/i.test(ua);
  
  if (isWindows && !('ontouchstart' in window)) {
    document.documentElement.classList.add('profile-win');
  }
  
  if (isTablet || (isAndroid && window.innerWidth >= 600)) {
    document.documentElement.classList.add('profile-tablet');
  }

  if (isAndroid) {
    const match = ua.match(/Android\s([0-9\.]+)/);
    const version = match ? parseFloat(match[1]) : 0;
    if (version >= 10) {
      document.documentElement.classList.add('profile-android13');
    } else if (version > 0 && version < 10) {
      document.documentElement.classList.add('profile-android5');
    }
  }
};
initDeviceProfile();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
