import { RosNode } from "./model/RosNode";

/** Data payload carried by every React Flow node -- just the underlying RosNode. */
export interface EntityNodeData {
  rosNode: RosNode;
}
