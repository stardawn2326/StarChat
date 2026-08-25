import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const canvasSource = readFileSync(resolve(testDirectory, 'Live2DCanvas.tsx'), 'utf8');
const runtimeSource = readFileSync(resolve(testDirectory, 'live2d-runtime.js'), 'utf8');
const chatSource = readFileSync(resolve(testDirectory, 'CompanionChat.tsx'), 'utf8');
const packageRuntimeSource = readFileSync(resolve(testDirectory, '../../../patches/pixi-live2d-display.patch'), 'utf8');

describe('idle presentation contracts', () => {
  it('keeps random idle presentation active outside a dialogue session', () => {
    expect(canvasSource).toContain('new IdleGazeController()');
    expect(canvasSource).toContain('idleGazeRef.current.update');
    expect(runtimeSource).toContain("requestedName === 'idle'");
    expect(runtimeSource).toContain('startFallbackGesture(requestedName, 720, FALLBACK_GESTURE_INTENSITY)');
  });

  it('pauses and stops the current idle presentation when dialogue owns focus', () => {
    expect(canvasSource).toContain('dialogueFocusGateRef.current.shouldIgnoreCursor()');
    const activeBranch = canvasSource.slice(
      canvasSource.indexOf("if (dialogueEvent.phase !== 'end')"),
      canvasSource.indexOf('if (!decision.resume) return;')
    );
    expect(activeBranch).toContain('runtime.controller.releaseFocus()');
    expect(activeBranch).toContain('pauseIdlePresentation(runtime)');
    expect(activeBranch).toContain("playAction('lean_forward', true)");
    expect(canvasSource).toContain('const pauseIdlePresentation');
    expect(canvasSource).toContain('dialogueIdleArbiterRef.current.pause');
    expect(canvasSource).toContain('idleGazeRef.current.reset()');
    expect(canvasSource).toContain('runtime.controller.stopAction()');
  });

  it('restores idle scheduling after end and after interrupted or timed-out conversation cleanup', () => {
    const endBranch = canvasSource.slice(canvasSource.indexOf('if (!decision.resume) return;'));
    expect(endBranch).toContain('cursorFollowGateRef.current.reset()');
    expect(endBranch).toContain('resumeIdlePresentation()');
    expect(endBranch).toContain('idleGazeRef.current.reset()');
    expect(endBranch).toContain('applyCursorFollow(runtime, cursor, rect)');
    expect(chatSource).toContain('finishDialoguePresentation();');
    expect(chatSource).toContain("emitDialogue('end')");
    expect(chatSource).toContain('语音音频播放超时');
    expect(canvasSource).toContain("void runtime.controller.playAction('idle', false)");
    expect(canvasSource).toContain('dialogueIdleArbiterRef.current.resume()');
  });

  it('waits five seconds after cursor stop and dialogue end before large idle motion', () => {
    expect(canvasSource).toContain('new CursorFollowGate(5000)');
    expect(canvasSource).toContain('new IdlePresentationGate()');
    expect(canvasSource).toContain('idlePresentationGateRef.current.update');
    const endBranch = canvasSource.slice(canvasSource.indexOf('if (!decision.resume) return;'));
    expect(endBranch).toContain('cursorFollowGateRef.current.reset()');
    expect(endBranch).toContain('resumeIdlePresentation()');
    const resumeFunction = canvasSource.slice(
      canvasSource.indexOf('const resumeIdlePresentation'),
      canvasSource.indexOf('const applyCursorFollow')
    );
    expect(resumeFunction).toContain('idlePresentationGateRef.current.reset()');
    expect(resumeFunction).not.toContain("playAction('idle', false)");
  });

  it('keeps stronger semantic gestures and a safe generic fallback when resources are missing', () => {
    expect(runtimeSource).toContain('FALLBACK_GESTURE_INTENSITY');
    expect(runtimeSource).toContain("'shake_head'");
    expect(runtimeSource).toContain("'emphasis'");
    expect(runtimeSource).toContain('startFallbackGesture(requestedName, 720, FALLBACK_GESTURE_INTENSITY)');
  });

  it('keeps Cubism native blink, natural movement and physics updates enabled during dialogue', () => {
    expect(packageRuntimeSource).toContain('this.eyeBlink');
    expect(packageRuntimeSource).toContain('this.updateNaturalMovements');
    expect(packageRuntimeSource).toContain('this.physics');
    expect(runtimeSource).toContain('installPhysicsGate');
  });
});
