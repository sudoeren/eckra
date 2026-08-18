// Pure commit-graph layout engine. No git, no chalk — the UI maps lane
// color names onto the active theme. Feed it the structured commits from
// getGraphData() and it returns render-ready rows.

const LANE_COLORS = ["primary", "ai", "success", "warning", "error"];

const VERTICAL = "\u2502"; // │
const RIGHT_DOWN = "\\";
const LEFT_DOWN = "/";
const NODE = "\u25cf"; // ●
const MERGE_NODE = "\u25c6"; // ◆

/**
 * Parse git's %D decorations ("HEAD -> main, tag: v1.4.10, origin/main")
 * into structured refs. Remote refs come out of git without a "remotes/"
 * prefix, so pass the configured remote names to classify them.
 */
function parseRefs(decorations, remoteNames = []) {
  const out = { head: null, branches: [], tags: [], remotes: [] };
  if (!decorations) return out;
  const isRemote = (tok) =>
    remoteNames.some((r) => tok === r || tok.startsWith(r + "/"));
  for (const raw of String(decorations).split(",")) {
    const token = raw.trim();
    if (!token) continue;
    if (token === "HEAD") {
      out.head = "HEAD";
    } else if (token.startsWith("HEAD -> ")) {
      out.head = "HEAD";
      out.branches.push(token.slice(8));
    } else if (token.startsWith("tag: ")) {
      out.tags.push(token.slice(5));
    } else if (isRemote(token)) {
      out.remotes.push(token);
    } else {
      out.branches.push(token);
    }
  }
  return out;
}

function firstFreeCol(lanes, from) {
  let col = from;
  while (lanes.some((l) => l.col === col)) col++;
  return col;
}

/**
 * Decide how the commit's own line continues below its node row, and pull
 * the first-parent lane back onto the node's column when it drifted right.
 * Returns the connector cell to draw in the segment below the node, or null.
 */
function buildConnection(commit, nodeCol, nodeColor, active) {
  if (commit.parents.length === 0) return null;
  const p0 = commit.parents[0];
  const lane = active.find((l) => l.id === p0);
  if (!lane || lane.col === nodeCol) return null;
  if (lane.col < nodeCol) {
    // Merge into the main line: the node bends left toward its parent.
    return { col: nodeCol, char: LEFT_DOWN, color: nodeColor };
  }
  // The parent's lane drifted right of the node (a side branch claimed a
  // shared commit first). Pull it back onto the node's column so the main
  // line stays left, and bend the parent's lane in with a "/".
  const oldCol = lane.col;
  lane.col = nodeCol;
  return { col: oldCol, char: LEFT_DOWN, color: lane.color };
}

/**
 * Build the connector segment between two consecutive node rows from the
 * previous commit's lane state. Returns null when everything is straight
 * vertical (git omits those rows too).
 */
function buildSegment(prevAfter, prevConnection) {
  const maxCol = Math.max(
    0,
    ...prevAfter.map((l) => l.col),
    prevConnection ? prevConnection.col : 0
  );
  const cells = new Array(maxCol + 1).fill(null);
  let hasCorner = false;
  for (const lane of prevAfter) {
    cells[lane.col] = {
      char: lane.fromCol < lane.col ? RIGHT_DOWN : VERTICAL,
      color: lane.color,
    };
    if (cells[lane.col].char !== VERTICAL) hasCorner = true;
  }
  if (prevConnection) {
    cells[prevConnection.col] = {
      char: prevConnection.char,
      color: prevConnection.color,
    };
    hasCorner = true;
  }
  if (!hasCorner) return null;
  return { type: "connector", cells };
}

/**
 * Compute the graph layout for a list of commits (newest first, as returned
 * by getGraphData). Returns an array of rows, each a { type, cells, commit }:
 * - "node": the commit row; cells[node column] is the ●/◆ marker, other
 *   cells are │ for lanes passing through.
 * - "connector": the segment between two node rows.
 * cells is an array of { char, color } (color is a LANE_COLORS name) or null.
 */
function buildGraphLayout(commits) {
  const known = new Set(commits.map((c) => c.hash));
  const active = [];
  let nextColor = 0;
  const colorOf = () => LANE_COLORS[nextColor++ % LANE_COLORS.length];
  const rows = [];
  let prevAfter = null;
  let prevConnection = null;

  for (const commit of commits) {
    let lane = active.find((l) => l.id === commit.hash);
    let nodeCol;
    if (lane) {
      nodeCol = lane.col;
    } else {
      nodeCol = firstFreeCol(active, 0);
      lane = {
        id: commit.hash,
        color: colorOf(),
        col: nodeCol,
        fromCol: nodeCol,
      };
      active.push(lane);
    }
    const nodeColor = lane.color;
    active.splice(active.indexOf(lane), 1);

    const created = [];
    let pos = nodeCol;
    for (let i = 0; i < commit.parents.length; i++) {
      const p = commit.parents[i];
      if (!known.has(p) || active.some((l) => l.id === p)) {
        pos++;
        continue;
      }
      const col = firstFreeCol(active, pos);
      const newLane = {
        id: p,
        color: i === 0 ? nodeColor : colorOf(),
        col,
        fromCol: nodeCol,
      };
      active.push(newLane);
      created.push(newLane);
      pos = col + 1;
    }

    if (prevAfter) {
      const segment = buildSegment(prevAfter, prevConnection);
      if (segment) rows.push(segment);
      for (const l of active) {
        if (!created.includes(l)) l.fromCol = l.col;
      }
    }

    const maxCol = Math.max(nodeCol, ...active.map((l) => l.col));
    const cells = new Array(maxCol + 1).fill(null);
    cells[nodeCol] = {
      char: commit.parents.length > 1 ? MERGE_NODE : NODE,
      color: nodeColor,
    };
    for (const l of active) {
      if (l.col !== nodeCol && l.fromCol === l.col) {
        cells[l.col] = { char: VERTICAL, color: l.color };
      }
    }
    rows.push({ type: "node", cells, commit });

    prevConnection = buildConnection(commit, nodeCol, nodeColor, active);
    prevAfter = active.slice();
  }

  return rows;
}

module.exports = {
  LANE_COLORS,
  parseRefs,
  buildGraphLayout,
};
