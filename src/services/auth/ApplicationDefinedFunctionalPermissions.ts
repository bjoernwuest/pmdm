// Applications using this template are encouraged to place their functional permission in this file and not in `functional_perms.ts` to achieve stability with upgrades of the template.

import type { FunctionalPermissionSelectType, FunctionalPermissionInsertType } from "@/types/FunctionalPermissionType.ts";
import { FunctionalPermissionNames } from "@/ui/auth/functional_permissions.ts";
import { registerFunctionalPermission } from "@/repo/FunctionalPermissionRepo.ts";
import { getDatabaseConnection } from "@/services/DatabaseDriver.ts";
