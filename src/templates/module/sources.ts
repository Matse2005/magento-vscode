import type { SourceItem, SourceContext } from '../../services/templateRegistry';

const licenses: SourceItem[] = [
  { label: 'OSL-3.0', description: 'Open Software License 3.0 (Magento default)' },
  { label: 'MPL-2.0', description: 'Mozilla Public License' },
  { label: 'MIT', description: 'MIT License' },
  { label: 'LGPL-2.1', description: 'GNU Lesser General Public License v2.1' },
  { label: 'LGPL-3.0', description: 'GNU Lesser General Public License v3.0' },
  { label: 'GPL-2.0', description: 'GNU General Public License v2.0' },
  { label: 'GPL-3.0', description: 'GNU General Public License v3.0' },
  { label: 'BSD-2-Clause', description: 'BSD 2-Clause License' },
  { label: 'BSD-3-Clause', description: 'BSD 3-Clause License' },
  { label: 'AFL-3.0', description: 'Academic Free License 3.0' },
  { label: 'Apache-2.0', description: 'Apache License 2.0' },
  { label: 'Proprietary', description: 'Proprietary/Commercial License' },
];

const installedModules = ({ modules }: SourceContext): SourceItem[] => {
  return modules.map(m => ({
    label: m.name,
    description: m.type === 'vendor' ? 'Vendor' : 'Custom',
    detail: m.version ? `v${m.version}` : undefined,
  }));
};

export default { licenses, installedModules };