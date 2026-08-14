// Applications using this template are encouraged to place their functional permissions in
// this file and not in `FunctionalPermissions.ts` to achieve stability with upgrades of the template.
//
// Add each permission as a `FunctionalPermissionInsertType` entry to the exported
// `functionalPermissionDefinitions` array. `registerFunctionalPermissions()` (in
// `FunctionalPermissions.ts`) registers these alongside the built-in permissions at startup.

import type {FunctionalPermissionInsertType} from "@/types/FunctionalPermissionType.ts";

export const functionalPermissionDefinitions: FunctionalPermissionInsertType[] = [];
