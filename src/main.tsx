// LEGACY ENG-ENGINE POLYFILLS (Ensuring compatibility with older Android System WebViews like Chrome 39 on Nokia N1 / Sharp R2)

// 1. globalThis Polyfill
if (typeof globalThis === 'undefined') {
  (function () {
    if (typeof self !== 'undefined') {
      // @ts-ignore
      self.globalThis = self;
    } else if (typeof window !== 'undefined') {
      // @ts-ignore
      window.globalThis = window;
    } else if (typeof global !== 'undefined') {
      // @ts-ignore
      global.globalThis = global;
    }
  })();
}

// 2. String.prototype.includes Polyfill
if (!String.prototype.includes) {
  String.prototype.includes = function(search, start) {
    'use strict';
    if ((search as any) instanceof RegExp) {
      throw TypeError('first argument must not be a RegExp');
    }
    if (start === undefined) { start = 0; }
    return this.indexOf(search, start) !== -1;
  };
}

// 3. String.prototype.repeat Polyfill
if (!String.prototype.repeat) {
  String.prototype.repeat = function(count) {
    'use strict';
    if (this == null) throw new TypeError('can\'t convert ' + this + ' to object');
    var str = '' + this;
    count = +count;
    if (count != count) count = 0;
    if (count < 0) throw new RangeError('repeat count must be non-negative');
    if (count == Infinity) throw new RangeError('repeat count must be less than infinity');
    count = Math.floor(count);
    if (str.length === 0 || count === 0) return '';
    if (str.length * count >= 1 << 28) throw new RangeError('repeat count must not overflow maximum string size');
    var maxCount = str.length * count;
    count = Math.floor(Math.log(count) / Math.LN2);
    while (count) {
       str += str;
       count--;
    }
    str += str.substring(0, maxCount - str.length);
    return str;
  };
}

// 4. String.prototype.padStart Polyfill
if (!String.prototype.padStart) {
  String.prototype.padStart = function(targetLength, padString) {
    targetLength = targetLength >> 0;
    padString = String(padString !== undefined ? padString : ' ');
    if (this.length >= targetLength) {
      return String(this);
    } else {
      targetLength = targetLength - this.length;
      if (targetLength > padString.length) {
        padString += padString.repeat(targetLength / padString.length);
      }
      return padString.slice(0, targetLength) + String(this);
    }
  };
}

// 5. Object.assign Polyfill
if (typeof Object.assign !== 'function') {
  Object.defineProperty(Object, "assign", {
    value: function assign(target: any, _varArgs: any) {
      'use strict';
      if (target == null) throw new TypeError('Cannot convert undefined or null to object');
      var to = Object(target);
      for (var index = 1; index < arguments.length; index++) {
        var nextSource = arguments[index];
        if (nextSource != null) {
          for (var nextKey in nextSource) {
            if (Object.prototype.hasOwnProperty.call(nextSource, nextKey)) {
              to[nextKey] = nextSource[nextKey];
            }
          }
        }
      }
      return to;
    },
    writable: true,
    configurable: true
  });
}

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Device UI Optimizer
const initDeviceProfile = () => {
  const ua = navigator.userAgent;
  // Use safe indexOf for absolute resilience
  const isWindows = ua.indexOf('Windows') > -1;
  const isAndroid = ua.indexOf('Android') > -1;
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
