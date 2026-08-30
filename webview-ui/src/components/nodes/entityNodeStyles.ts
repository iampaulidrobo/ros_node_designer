import { NodeType } from "../../model/NodeType";

/** Fixed brand accent colors per entity type -- kept constant across themes. */
export const ACCENT_COLORS: Record<NodeType, string> = {
  node: "#3b82f6",
  topic: "#14b8a6",
  service: "#f59e0b",
  action: "#8b5cf6",
};

export const SELECTED_BORDER_COLOR = "#5aa9ff";

/** clip-path silhouette per type, to mirror the shapes used in the original desktop app. */
export const CLIP_PATHS: Record<NodeType, string | undefined> = {
  node: undefined, // plain rounded rectangle, handled via border-radius instead
  topic: undefined, // pill, handled via border-radius instead
  service: "polygon(6% 0%, 94% 0%, 100% 50%, 94% 100%, 6% 100%, 0% 50%)",
  action: "polygon(0% 50%, 14% 0%, 86% 0%, 100% 50%, 86% 100%, 14% 100%)",
};

export const BORDER_RADIUS: Record<NodeType, string> = {
  node: "10px",
  topic: "999px",
  service: "4px",
  action: "4px",
};
