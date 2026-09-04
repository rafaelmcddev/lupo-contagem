import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { configure } from '@testing-library/react';

// Polyfill for File.prototype.text() in jsdom
if (!File.prototype.text) {
  File.prototype.text = async function () {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(this);
    });
  };
}

// Increase default timeout for waitFor
configure({ asyncUtilTimeout: 3000 });

afterEach(cleanup);
