declare module "saxon-js" {
  type TransformOptions = {
    stylesheetFileName?: string;
    sourceText?: string;
    destination?: "serialized";
  };

  const SaxonJS: {
    transform(options: TransformOptions, execution?: "sync" | "async"): unknown;
  };

  export default SaxonJS;
}
