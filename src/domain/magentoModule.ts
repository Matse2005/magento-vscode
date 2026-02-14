/**
 * Represents a Magento module
 */
export class MagentoModule {
  /**
   * Full module name (Vendor_ModuleName)
   */
  public readonly name: string;

  /**
   * Absolute path to the module directory
   */
  public readonly path: string;

  /**
   * Module type: vendor (from vendor/) or custom (from app/code/)
   */
  public readonly type: 'vendor' | 'custom';

  /**
   * Module version from composer.json (if available)
   */
  public readonly version?: string;

  constructor(
    name: string,
    path: string,
    type: 'vendor' | 'custom',
    version?: string
  ) {
    this.name = name;
    this.path = path;
    this.type = type;
    this.version = version;
  }

  /**
   * Get vendor name (part before underscore)
   */
  public getVendor(): string {
    return this.name.split('_')[0];
  }

  /**
   * Get module name (part after underscore)
   */
  public getModuleName(): string {
    return this.name.split('_')[1] || this.name;
  }
}
