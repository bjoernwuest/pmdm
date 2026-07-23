import {message_CreateTargetSystem, message_DisableTargetSystem, message_UpdateTargetSystem} from "@/types/TargetSystemType.ts";
import { TargetSystems } from "@/schema/TargetSystemSchema.ts";
import { createConfigurationRepository } from "@/repo/_crud_Repo.ts";

/**
 * Returns the total number of target systems.
 *
 * By default, disabled target systems are excluded from the count.
 *
 * @param db Database client instance.
 * @param includeDisabled Whether disabled target systems should be included.
 * @returns Total number of matching target systems.
 */
const repo = createConfigurationRepository(TargetSystems, { create: message_CreateTargetSystem, update: message_UpdateTargetSystem, disable: message_DisableTargetSystem, });

export const { count, get, getByIdentifier, create, update, disable, enable } = repo;
