import { assistantCaseAnnouncementPaths } from "./publicPaths/assistantCasesAnnouncements";
import { generationTaskPaths } from "./publicPaths/generationTasks";
import { sessionsHistoryImagePaths } from "./publicPaths/sessionsHistoryImages";
import { systemAuthMePaths } from "./publicPaths/systemAuthMe";

export const publicPaths = {
  ...systemAuthMePaths,
  ...generationTaskPaths,
  ...sessionsHistoryImagePaths,
  ...assistantCaseAnnouncementPaths
};
