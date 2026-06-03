/** A cell position within the rendered grid */
export interface GridCellInfo {
	row: number;
	col: number;
	rowId: string;
	colId: string;
	/** Absolute terminal row where this cell starts (0-indexed) */
	terminalRow: number;
	/** Absolute terminal column where this cell starts (0-indexed) */
	terminalCol: number;
}

/** Height constraint for a row */
export interface HeightConstraint {
	/** Minimum rows (characters) this row occupies */
	min: number;
	/** Maximum rows; undefined = unbounded */
	max?: number;
	/** When true, this row consumes remaining space after fixed rows are allocated */
	grow?: boolean;
}

/** Responsive behavior when terminal width < breakpoint */
export interface ResponsiveConfig {
	/** Terminal width threshold in columns */
	breakpoint: number;
	/** Layout mode when below breakpoint: stacked = columns stack vertically, hidden = row hidden */
	narrowLayout: "stacked" | "hidden";
}

/** Width constraint for a column */
export interface WidthConstraint {
	/** Proportional weight (e.g. 2 = 2/3 of row) */
	fraction?: number;
	/** Minimum characters before collapse; defaults to 1 */
	min?: number;
	/** Maximum characters; undefined = unbounded */
	max?: number;
}

/** Optional border between columns */
export interface BorderConfig {
	/** Border character (default "│") */
	char?: string;
	/** Apply theme color to border; default "border" */
	color?: string;
}

/** Widget reference within a column cell */
export interface WidgetConfig {
	/** Registered widget type name */
	type: string;
	/** Widget-specific configuration object */
	config?: Record<string, unknown>;
}

/** A single column within a row */
export interface ColumnConfig {
	id: string;
	width: WidthConstraint;
	/** When true, content scrolls within allocated height */
	scrollable?: boolean;
	/** Optional border drawn between this and the previous column */
	border?: BorderConfig;
	widget: WidgetConfig;
}

/** A single row in the grid */
export interface RowConfig {
	id: string;
	height: HeightConstraint;
	responsive?: ResponsiveConfig;
	/** Whether this row is visible; default true */
	visible?: boolean;
	columns: ColumnConfig[];
}

/** Top-level grid configuration */
export interface GridConfig {
	/** Min terminal width before fallback to default editor; default 40 */
	minWidth?: number;
	/** Min terminal height before fallback to default editor; default 8 */
	minHeight?: number;
	rows: RowConfig[];
}

/** Width allocation for one column after layout solving */
export interface ColumnLayout {
	id: string;
	width: number;
	scrollable: boolean;
	borderLeft?: BorderConfig;
	widget: WidgetConfig;
}

/** Height allocation for one row after layout solving */
export interface RowLayout {
	id: string;
	/** Pre-allocated height (usually the row's min); actual rendered height may grow */
	height: number;
	/** Minimum rows from config; used by the grid component for clamping */
	minHeight: number;
	/** Maximum rows from config (Infinity if unbounded); used for clamping */
	maxHeight: number;
	/** Whether columns are stacked (narrow layout) instead of side-by-side */
	stacked: boolean;
	columns: ColumnLayout[];
}

/** The complete solved layout plan */
export interface LayoutPlan {
	rows: RowLayout[];
	/** true if the terminal is below minWidth/minHeight */
	fallback: boolean;
}
