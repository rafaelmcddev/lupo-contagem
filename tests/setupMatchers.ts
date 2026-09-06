import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { configure } from '@testing-library/react';

// The app uses next/navigation's useRouter (e.g. to redirect after importing
// an XML invoice) and usePathname (for the persistent nav's active-link
// highlighting). Outside of the real Next.js runtime there is no App Router
// context to provide them, so stub both globally for every test file.
export const mockUsePathname = vi.fn(() => '/');
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => mockUsePathname(),
}));

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

afterEach(() => {
  cleanup();
  mockUsePathname.mockReset().mockReturnValue('/');
});
