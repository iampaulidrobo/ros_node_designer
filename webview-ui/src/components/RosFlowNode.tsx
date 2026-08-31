import React, { memo } from "react";
import { Handle, Position } from "reactflow";
import { NodeType } from "../model/NodeType";
import { RosNode } from "../model/RosNode";

export interface RosFlowNodeData {
  rosNode: RosNode;
}

export const ACCENT_COLORS: Record<NodeType, string> = {
  node: "#3b82f6",
  topic: "#14b8a6",
  service: "#f59e0b",
  action: "#8b5cf6",
};

export const SELECTED_BORDER_COLOR = "#5aa9ff";

interface Props {
  data: RosFlowNodeData;
  selected: boolean;
  type: NodeType;
}

/** Shared visual body for all four ROS entity node types; the four exported
 * components below only fix `type` so React Flow can tell them apart. */
const RosFlowNodeBase: React.FC<Props> = ({ data, selected, type }) => {
  const { rosNode } = data;
  const accent = ACCENT_COLORS[type];

  return (
    <div
      className={`ros-node ros-node--${type}${selected ? " ros-node--selected" : ""}`}
      style={{ borderColor: selected ? SELECTED_BORDER_COLOR : accent }}
    >
      <Handle type="target" position={Position.Left} className="ros-node__handle" />
      <div className="ros-node__header" style={{ background: accent }}>
        {type.toUpperCase()}
      </div>
      <div className="ros-node__body">
        <div className="ros-node__name" title={rosNode.nodeName}>
          {rosNode.nodeName}
        </div>
        {rosNode.topic && (
          <div className="ros-node__topic" title={rosNode.topic}>
            {rosNode.topic}
          </div>
        )}
        {rosNode.messageType && (
          <div className="ros-node__msgtype" title={rosNode.messageType}>
            {rosNode.messageType}
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Right} className="ros-node__handle" />
    </div>
  );
};

export const NodeEntityNode = memo((props: Omit<Props, "type">) => (
  <RosFlowNodeBase {...props} type="node" />
));
export const TopicEntityNode = memo((props: Omit<Props, "type">) => (
  <RosFlowNodeBase {...props} type="topic" />
));
export const ServiceEntityNode = memo((props: Omit<Props, "type">) => (
  <RosFlowNodeBase {...props} type="service" />
));
export const ActionEntityNode = memo((props: Omit<Props, "type">) => (
  <RosFlowNodeBase {...props} type="action" />
));

export const nodeTypes = {
  node: NodeEntityNode,
  topic: TopicEntityNode,
  service: ServiceEntityNode,
  action: ActionEntityNode,
};
