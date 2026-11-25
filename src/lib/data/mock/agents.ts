import i18n from '@/i18n/config';
import { simulate } from './latency';
import type { AgentRepository, AutomationRepository } from '../contracts';

const demo = () => new Error(i18n.t('agents.errors.demo'));

/** Frontend-only mode: agents and automations run on the server, so the demo lists nothing and runs nothing. */
export class MockAgentRepository implements AgentRepository {
  list() {
    return simulate('agents.list', () => []);
  }
  create() {
    return simulate('agents.create', () => Promise.reject(demo()));
  }
  setActive() {
    return simulate('agents.active', () => Promise.reject(demo()));
  }
  remove() {
    return simulate('agents.remove', () => Promise.reject(demo()));
  }
  run() {
    return simulate('agents.run', () => Promise.reject(demo()));
  }
  getRun() {
    return simulate('agents.getRun', () => Promise.reject(demo()));
  }
  steps() {
    return simulate('agents.steps', () => []);
  }
  cancel() {
    return simulate('agents.cancel', () => Promise.reject(demo()));
  }
  runs() {
    return simulate('agents.runs', () => []);
  }
}

export class MockAutomationRepository implements AutomationRepository {
  list() {
    return simulate('automations.list', () => []);
  }
  create() {
    return simulate('automations.create', () => Promise.reject(demo()));
  }
  setActive() {
    return simulate('automations.active', () => Promise.reject(demo()));
  }
  remove() {
    return simulate('automations.remove', () => Promise.reject(demo()));
  }
  runNow() {
    return simulate('automations.run', () => Promise.reject(demo()));
  }
}
