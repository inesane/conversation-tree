export interface Message {
  id: string;
  index: number;
  speaker: string;
  text: string;
}

export type TopicStatus = "active" | "paused" | "completed" | "abandoned";

export type TopicType =
  | "root"
  | "main_topic"
  | "subtopic"
  | "tangent"
  | "return"
  | "progression";

export interface TopicNode {
  id: string;
  label: string;
  summary: string;
  status: TopicStatus;
  parentId: string | null;
  children: string[];
  messageIndices: number[];
  depth: number;
  topicType: TopicType;
  createdAtIndex: number;
  pausedAtIndex?: number;
}

export type ShiftClassification =
  | "continue"
  | "subtopic"
  | "new_topic"
  | "tangent"
  | "return"
  | "progression";

export interface TopicShift {
  afterMessageIndex: number;
  classification: ShiftClassification;
  newTopicLabel: string;
  newTopicSummary: string;
  returnTargetLabel?: string;
  parentTopic?: string;
  siblingOf?: string;
  confidence: number;
  reasoning: string;
}

export interface ChunkWindow {
  messages: Message[];
  windowIndex: number;
  overlapMessages: Message[];
}

export interface TreeStateSummary {
  activeTopicId: string;
  activeTopicLabel: string;
  activeTopicSummary: string;
  topicPath: string[];
  allTopics: {
    id: string;
    label: string;
    summary: string;
    status: TopicStatus;
    depth: number;
    topicType: TopicType;
  }[];
}

export interface SerializedTree {
  nodes: Record<string, TopicNode>;
  rootId: string;
  activeTopicId: string;
}
