import { AGENT_EVENTS, AgentIssueEvent, agentEventSystem } from './agent-event-system';

type ToastModule = typeof import('sonner');

class AgentNotificationService {
  private initialized = false;

  initialize(): void {
    if (this.initialized || typeof window === 'undefined') {
      return;
    }

    agentEventSystem.on(AGENT_EVENTS.ERROR, this.handleIssue);
    agentEventSystem.on(AGENT_EVENTS.WARNING, this.handleIssue);
    this.initialized = true;
  }

  dispose(): void {
    if (!this.initialized) {
      return;
    }

    agentEventSystem.off(AGENT_EVENTS.ERROR, this.handleIssue);
    agentEventSystem.off(AGENT_EVENTS.WARNING, this.handleIssue);
    this.initialized = false;
  }

  private handleIssue = (issue: AgentIssueEvent): void => {
    this.logIssue(issue);
    if (typeof window !== 'undefined') {
      this.showToast(issue).catch(() => {
        /* ignore toast failures */
      });
    }
  };

  private logIssue(issue: AgentIssueEvent): void {
    const payload = {
      message: issue.message,
      description: issue.description,
      source: issue.source,
      scope: issue.scope,
      context: issue.context,
      timestamp: issue.timestamp,
    };

    if (issue.level === 'error') {
      console.error(`[Agent][ERROR] ${issue.message}`, payload, JSON.stringify(issue.error, null, 2));
    } else {
      console.warn(`[Agent][WARNING] ${issue.message}`, JSON.stringify(payload, null, 2));
    }
  }

  private async showToast(issue: AgentIssueEvent): Promise<void> {
    const module: ToastModule = await import('sonner');
    const description =
      issue.description ||
      (issue.scope ? `Контекст: ${issue.scope}` : undefined);
    const duration = issue.level === 'error' ? 6000 : 4000;

    const commonOptions = {
      description,
      duration,
      action: issue.action,
    };

    if (issue.level === 'error') {
      module.toast.error(issue.message, commonOptions);
    } else {
      module.toast.warning(issue.message, commonOptions);
    }
  }
}

export const agentNotificationService = new AgentNotificationService();