/** A generic ROS design element type. */
export type NodeType = "node" | "topic" | "service" | "action";

export const NodeTypeValues: NodeType[] = ["node", "topic", "service", "action"];

/** Human-readable label for a NodeType, e.g. "node" -> "Node". */
export function nodeTypeLabel(type: NodeType): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}
