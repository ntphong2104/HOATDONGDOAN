import fs from 'fs';
import path from 'path';

describe('Motion Design Tokens & Animation Verification', () => {
  const globalsCssPath = path.join(process.cwd(), 'src/app/globals.css');
  const globalsCss = fs.readFileSync(globalsCssPath, 'utf-8');

  test('globals.css defines essential motion tokens and GPU-accelerated easing curves', () => {
    expect(globalsCss).toContain('--ease-spring');
    expect(globalsCss).toContain('--ease-smooth');
    expect(globalsCss).toContain('--duration-fast');
    expect(globalsCss).toContain('--duration-normal');
    expect(globalsCss).toContain('--duration-modal');
  });

  test('globals.css defines essential animation keyframes for smooth UI transitions', () => {
    expect(globalsCss).toContain('@keyframes fadeIn');
    expect(globalsCss).toContain('@keyframes modalScale');
    expect(globalsCss).toContain('@keyframes dropdownSlide');
    expect(globalsCss).toContain('@keyframes shimmerWave');
  });

  test('globals.css includes prefers-reduced-motion accessibility media query', () => {
    expect(globalsCss).toContain('prefers-reduced-motion');
  });
});
