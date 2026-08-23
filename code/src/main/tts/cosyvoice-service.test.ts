import { describe, expect, it } from 'vitest';
import { cosyVoiceInstallPathsForRoot, isManagedCosyVoiceBaseUrl } from './cosyvoice-service';

describe('CosyVoice local service installation', () => {
  it('only manages the installed loopback service', () => {
    expect(isManagedCosyVoiceBaseUrl('http://127.0.0.1:50000')).toBe(true);
    expect(isManagedCosyVoiceBaseUrl('http://localhost:50000/')).toBe(true);
    expect(isManagedCosyVoiceBaseUrl('https://voice.example.test')).toBe(false);
    expect(isManagedCosyVoiceBaseUrl('http://127.0.0.1:51000')).toBe(false);
  });

  it('keeps the runtime and model outside the packaged EXE', () => {
    const install = cosyVoiceInstallPathsForRoot('C:\\Project-008');
    expect(install.pythonPath).toBe('C:\\Project-008\\tools\\cosyvoice-python310\\python.exe');
    expect(install.launcherPath).toBe('C:\\Project-008\\tools\\start-cosyvoice-server.py');
  });
});
