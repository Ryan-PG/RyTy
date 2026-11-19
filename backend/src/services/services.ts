import type { AppDatabase } from "../database/adapter";
import type { AppConfig } from "../env";
import { createUserRepository, type UserRepository } from "../repositories/users";
import { createActivityRepository, type ActivityRepository } from "../repositories/activities";
import { createTimerRepository, type TimerRepository } from "../repositories/timers";
import { createSettingsRepository, type SettingsRepository } from "../repositories/settings";
import { createProjectRepository, type ProjectRepository } from "../repositories/projects";
import { createTagRepository, type TagRepository } from "../repositories/tags";
import { createCoopRepository, type CoopRepository } from "../repositories/coops";
import { createExpenseRepository, type ExpenseRepository } from "../repositories/expenses";
import {
  createLoginAttemptsRepository,
  type LoginAttemptsRepository,
} from "../repositories/loginAttempts";

/**
 * All repositories wired once per runtime environment. Business services
 * receive this bundle; they never construct repositories themselves.
 */
export interface Services {
  db: AppDatabase;
  config: AppConfig;
  users: UserRepository;
  activities: ActivityRepository;
  timers: TimerRepository;
  settings: SettingsRepository;
  projects: ProjectRepository;
  tags: TagRepository;
  coops: CoopRepository;
  expenses: ExpenseRepository;
  loginAttempts: LoginAttemptsRepository;
}

export function createServices(db: AppDatabase, config: AppConfig): Services {
  return {
    db,
    config,
    users: createUserRepository(db),
    activities: createActivityRepository(db),
    timers: createTimerRepository(db),
    settings: createSettingsRepository(db),
    projects: createProjectRepository(db),
    tags: createTagRepository(db),
    coops: createCoopRepository(db),
    expenses: createExpenseRepository(db),
    loginAttempts: createLoginAttemptsRepository(db),
  };
}
