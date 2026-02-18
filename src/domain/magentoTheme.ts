export class MagentoTheme {
  constructor(
    public readonly name: string,            // "Vendor/theme-name"
    public readonly path: string,
    public readonly area: 'frontend' | 'adminhtml',
    public readonly type: 'vendor' | 'custom',
    public readonly title?: string,            // from theme.xml <title>
    public readonly composerName?: string,           // from composer.json
    public readonly version?: string
  ) { }
}