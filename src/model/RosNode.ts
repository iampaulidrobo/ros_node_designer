import { NodeType, nodeTypeLabel } from "./NodeType";

/** A generic ROS entity in the design graph (avoid the name `Node` -- collides with DOM/Node.js types). */
export interface RosNode {
  id: string;
  type: NodeType;
  nodeName: string;
  topic: string;
  messageType: string;
  x: number;
  y: number;
}

/** On-disk JSON shape for a RosNode (snake_case, matches the original Python app's schema). */
export interface RosNodeJSON {
  id: string;
  type: NodeType;
  node_name: string;
  topic: string;
  message_type: string;
  x: number;
  y: number;
}

export function rosNodeToDict(node: RosNode): RosNodeJSON {
  return {
    id: node.id,
    type: node.type,
    node_name: node.nodeName,
    topic: node.topic,
    message_type: node.messageType,
    x: node.x,
    y: node.y,
  };
}

export function rosNodeFromDict(data: RosNodeJSON): RosNode {
  return {
    id: String(data.id),
    type: data.type,
    nodeName: data.node_name,
    topic: data.topic,
    messageType: data.message_type,
    x: typeof data.x === "number" ? data.x : 0,
    y: typeof data.y === "number" ? data.y : 0,
  };
}

export function rosNodeLabel(node: RosNode): string {
  return nodeTypeLabel(node.type);
}
