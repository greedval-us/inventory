import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NtExecutable, NtExecutableResource, Resource } from 'resedit';

// Write metadata locally so an unsigned build does not depend on winCodeSign.
export function setWindowsVersion({ appOutDir, packager }) {
  const { productFilename, productName, version, copyright } = packager.appInfo;
  const filename = productFilename + '.exe';
  const path = join(appOutDir, filename);
  const executable = NtExecutable.from(readFileSync(path), { ignoreCert: true });
  const resources = NtExecutableResource.from(executable);
  for (const entry of Resource.VersionInfo.fromEntries(resources.entries)) {
    const locale = { lang: 1033, codepage: 1200 };
    entry.setFileVersion(version, locale.lang);
    entry.setProductVersion(version, locale.lang);
    entry.setStringValues(locale, {
      ProductName: productName, InternalName: productName, CompanyName: productName,
      FileDescription: productName, OriginalFilename: filename, LegalCopyright: copyright,
    });
    entry.outputToResourceEntries(resources.entries);
  }
  resources.outputResource(executable);
  writeFileSync(path, Buffer.from(executable.generate()));
}
