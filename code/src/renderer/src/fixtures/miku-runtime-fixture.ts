// Read-only parser facts captured from the current external Miku package.
// This fixture contains parameter metadata only, never model textures/moc data.
export const MIKU_EXPRESSION_FIXTURE = {
  '比心.exp3.json': [{ id: 'Param133', value: 0 }, { id: 'Param134', value: 0 }, { id: 'Param135', value: 1 }],
  '唱歌.exp3.json': [{ id: 'Param133', value: 0 }, { id: 'Param134', value: 1 }, { id: 'Param135', value: 0 }],
  '葱.exp3.json': [{ id: 'Param133', value: 1 }, { id: 'Param134', value: 0 }, { id: 'Param135', value: 0 }],
  '脸红.exp3.json': [{ id: 'Param130', value: 1 }],
  '前倾.exp3.json': [{ id: 'Param132', value: 1 }],
  '圈圈.exp3.json': [{ id: 'Param125', value: 1 }],
  '水印.exp3.json': [{ id: 'Param137', value: 1 }],
  'QQ人.exp3.json': [{ id: 'Param131', value: 1 }, { id: 'Param136', value: 1 }]
} as const;

export const MIKU_MOTION_FIXTURE = {
  fileName: 'Scene1.motion3.json',
  duration: 2.667,
  fps: 30,
  loop: true,
  curveIds: ['Param16', 'Param45', 'Param63', 'Param126', 'Param70']
} as const;
