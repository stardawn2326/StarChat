import type { AgentMode, AgentRouteDecision } from '../shared/agent';

export interface RouteTurnInput {
  mode: AgentMode;
  message: string;
  classifyAmbiguous?: () => Promise<'agent' | 'companion'>;
}

const AGENT_RULES: ReadonlyArray<{ id: string; pattern: RegExp; explain: string }> = [
  { id: 'workspace-file', pattern: /((读取|打开|列出|搜索|查找|查看|检查|分析|处理|定位|扫描|审查|修改|修复|实现|新增|删除|重构|编辑|读一下|看看).{0,20}(文件|目录|文件夹|路径|源码|代码|项目|仓库|工作区|文件内容|todo))|((^|\s)(src|test|tests|docs|code)\/[^\s]+)|([A-Za-z]:\\[^\s]+)/iu, explain: '消息明确涉及授权工作区中的文件、代码、项目或路径。' },
  { id: 'verification', pattern: /((运行|执行|跑|通过|失败|排查|回归|验证|请|帮我|进行|开始).{0,16}(测试|单测|验证|构建|编译|类型检查|typecheck|build|测试套件))|((测试|单测|验证|构建|编译|类型检查|typecheck|build)(一下|项目|代码|用例|套件|脚本))|\b(typecheck|build)\b/iu, explain: '消息明确要求测试、构建或验证。' },
  { id: 'change', pattern: /(修改|改动|修复|实现|新增|删除|重构|补丁|apply.?patch|写入|保存)/iu, explain: '消息明确要求修改项目内容。' },
  { id: 'git-readonly', pattern: /(git\s+(status|diff|log)|提交状态|差异|变更清单)/iu, explain: '消息明确要求只读 Git 检查。' }
];

export async function routeTurn(input: RouteTurnInput): Promise<AgentRouteDecision> {
  const message = input.message.trim();
  if (input.mode === 'companion') return { route: 'companion', method: 'forced', explain: '已由用户强制使用纯陪伴模式。' };
  if (input.mode === 'agent') return { route: 'agent', method: 'forced', explain: '已由用户强制使用 Agent 模式。' };

  for (const rule of AGENT_RULES) {
    if (rule.pattern.test(message)) {
      return { route: 'agent', method: 'deterministic', ruleId: rule.id, explain: rule.explain };
    }
  }
  if (!message || /^(你好|嗨|在吗|谢谢|晚安|早安|哈哈|呜呜|陪我聊聊)/iu.test(message) || /(心情|聊聊|陪伴|开心|难过|焦虑|今天过得)/iu.test(message)) {
    return { route: 'companion', method: 'deterministic', ruleId: 'companionship', explain: '消息符合普通陪伴对话特征。' };
  }

  if (!input.classifyAmbiguous) {
    return { route: 'companion', method: 'safe-fallback', ruleId: 'no-classifier', explain: '消息含义模糊且没有可用分类器，安全降级为陪伴。' };
  }
  try {
    const classified = await input.classifyAmbiguous();
    if (classified === 'agent') return { route: 'agent', method: 'classifier', ruleId: 'ambiguous-classifier', explain: '轻量分类器判断消息需要后台任务。' };
    if (classified === 'companion') return { route: 'companion', method: 'classifier', ruleId: 'ambiguous-classifier', explain: '轻量分类器判断消息属于陪伴对话。' };
  } catch {
    // A classifier is advisory only. Network/model failures must never grant tools.
  }
  return { route: 'companion', method: 'safe-fallback', ruleId: 'classifier-failed', explain: '轻量分类器不可用或返回无效结果，安全降级为陪伴。' };
}
