export type ChatRole = 'user' | 'assistant';

export type AgentStage =
  | 'receiving_context'
  | 'planning'
  | 'tooling'
  | 'drafting'
  | 'streaming'
  | 'done'
  | 'error';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: number;
}

export interface PageFormField {
  name: string;
  type: string;
  required: boolean;
  label?: string;
}

export interface PageForm {
  id: string;
  method: string;
  action: string;
  fields: PageFormField[];
}

export interface PageDetails {
  title: string;
  url: string;
  text: string;
  forms?: PageForm[];
  selection?: string;
}

export interface ChatPayload {
  message: string;
  page_content: string;
  page_details: PageDetails;
}
