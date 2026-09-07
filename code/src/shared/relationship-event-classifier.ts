import type { RelationshipEventInput } from './relationship-engine';

export type RelationshipEventType = Exclude<RelationshipEventInput['type'], 'conversation'>;

function combined(userMessage: string, assistantMessage = ''): string {
  return `${userMessage}\n${assistantMessage}`.trim();
}

export function classifyRelationshipEvent(userMessage: string, assistantMessage = ''): RelationshipEventInput {
  const text = combined(userMessage, assistantMessage);
  if (/(?:不要|别再|别这样|不希望|请停止|到此为止)/u.test(userMessage)) return { type: 'boundary' };
  if (/(?:对不起|抱歉|我错了|原谅|接受道歉|没关系)/u.test(text)) return { type: 'repair' };
  if (/(?:生气|难过|失望|不满|讨厌|糟糕|错误|失败|焦虑|不安|气死|过分)/u.test(text)) return { type: 'conflict' };
  if (/(?:我(?:叫|是|喜欢|偏好|爱|习惯|通常|不喜欢|讨厌|不希望)|我的(?:朋友|家人|同事|伴侣|项目|工作|计划|目标))/u.test(userMessage)) {
    return { type: 'personal_disclosure' };
  }
  if (/(?:谢谢|感谢|太好了|真棒|开心|高兴|喜欢|哈哈|辛苦了|帮大忙)/u.test(text)) return { type: 'positive_interaction' };
  if (/(?:一起|共同|我们|上次|第一次|终于|完成了|发布|庆祝|纪念)/u.test(userMessage)) return { type: 'shared_event' };
  return { type: 'normal_interaction' };
}
