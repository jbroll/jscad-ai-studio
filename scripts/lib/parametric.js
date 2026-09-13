const DECLARATIONS = [
  /\bgetParameterDefinitions\b/,
  /@jscad-params\b/,
  // params-proxy style: `params.rows = { type: 'slider', ... }` or `params._type = 'Car'`
  /\.\s*[A-Za-z_$][\w$]*\s*=\s*\{[^}]*\btype\s*:/,
  /\.\s*_type\s*=/,
];

export const declaresParameters = (source) => DECLARATIONS.some((re) => re.test(String(source)));
