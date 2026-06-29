declare module "qrcode-terminal" {
  type GenerateOptions = {
    small?: boolean;
  };

  const qrcode: {
    generate(input: string, options?: GenerateOptions): void;
  };

  export default qrcode;
}
