type FontBasicResponse = {
  id: string;
  family: string;
  subsets: string[];
  defSubset: string;
  weights: number[];
  styles: string[];
};

type FontResponse = FontBasicResponse & {
  variants: Record<
    string /** weights */,
    Record<
      string /** styles */,
      Record<
        string /** subsets */,
        { url: { woff2: string; woff: string; ttf: string } }
      >
    >
  >;
};

type DeepNestConfig = {
  units: "mm" | "inch";
  scale: number;
  spacing: number;
  curveTolerance: number;
  clipperScale: number;
  rotations: number;
  threads: number;
  populationSize: number;
  mutationRate: number;
  placementType: "gravity" | "box" | "convexhull";
  mergeLines: boolean;
  /**
   * ratio of material reduction to laser time. 0 = optimize material only, 1 = optimize laser time only
   */
  timeRatio: number;
  simplify: boolean;
  dxfImportScale: number;
  dxfExportScale: number;
  endpointTolerance: number;
  conversionServer: string;
};

type NestingOptions = Partial<DeepNestConfig> & {
  container: { width: number; height: number } | string;
  timeout?: number;
  progressCallback?: (data: {
    phase: string;
    index: number;
    progress: number;
    threads: number;
  }) => any;
};

/**
 * @returns disposer
 */
export function nest(
  svgInput: (
    | string
    | {
        file: string;
        svg: string;
      }
  )[],
  callback: (data: {
    result: any;
    data: any;
    elements: any;
    status: {
      better: boolean;
      complete: boolean;
      placed: number;
      total: number;
    };
    svg: () => string;
    abort: () => Promise<void>;
  }) => any,
  options: NestingOptions
): Promise<() => Promise<void>>;
