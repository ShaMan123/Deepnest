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
