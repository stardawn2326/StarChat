import { describe, expect, it } from 'vitest';
import { cosyVoiceInstallPathsForHome, cosyVoiceLauncherArgs, isManagedCosyVoiceBaseUrl } from './cosyvoice-service';

describe('CosyVoice local service installation', () => {
  it('only manages the installed loopback service', () => {
    expect(isManagedCosyVoiceBaseUrl('http://127.0.0.1:50000')).toBe(true);
    expect(isManagedCosyVoiceBaseUrl('http://localhost:50000/')).toBe(true);
    expect(isManagedCosyVoiceBaseUrl('https://voice.example.test')).toBe(false);
    expect(isManagedCosyVoiceBaseUrl('http://127.0.0.1:51000')).toBe(false);
  });

  it('keeps every CosyVoice runtime payload under the configured D drive home', () => {
    const install = cosyVoiceInstallPathsForHome(
      'D:\\CosyVoice',
      'C:\\Project-008-StarChat\\tools\\start-cosyvoice-server.py'
    );
    expect(install.homePath).toBe('D:\\CosyVoice');
    expect(install.pythonPath).toBe('D:\\CosyVoice\\python310\\python.exe');
    expect(install.sourcePath).toBe('D:\\CosyVoice\\source');
    expect(install.launcherPath).toBe('C:\\Project-008-StarChat\\tools\\start-cosyvoice-server.py');
  });

  it('selects exactly one local model mode per service process', () => {
    expect(cosyVoiceLauncherArgs('C:\\Project-008-StarChat\\tools\\start-cosyvoice-server.py', 'D:\\CosyVoice', 'sft')).toEqual([
      'C:\\Project-008-StarChat\\tools\\start-cosyvoice-server.py',
      '--cosyvoice-home',
      'D:\\CosyVoice',
      '--voice-mode',
      'sft'
    ]);
    expect(cosyVoiceLauncherArgs('C:\\Project-008-StarChat\\tools\\start-cosyvoice-server.py', 'D:\\CosyVoice', 'zero-shot')[4]).toBe('zero-shot');
  });
});
