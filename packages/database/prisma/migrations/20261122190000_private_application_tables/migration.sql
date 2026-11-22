-- Midad uses Prisma through the server, not Supabase's browser Data API.
-- Deny Data API roles access to existing application tables even if the
-- Supabase project still exposes the public schema or grants them by default.
DO $$
DECLARE
  app_table text;
  api_role text;
BEGIN
  FOREACH app_table IN ARRAY ARRAY[
    'User', 'TeacherProfile', 'StudentProfile', 'ParentProfile', 'Course',
    'CourseContent', 'Quiz', 'Question', 'StudentQuizResult', 'StudentAnswer',
    'Lesson', 'ClassSession', 'Enrollment', 'Payment', 'SeatReservation',
    'Badge', 'Achievement', 'PointTransaction', 'PasswordReset',
    'SessionAttendance', 'WhiteboardDocument', 'ClassroomState',
    'DrawingPermission', 'LearningState', 'SessionReport', 'SessionMaterial',
    'SessionHomework', 'HomeworkSubmission', 'HomeworkAudio',
    'WhatsAppNotification', 'SessionSpeakingPermission', 'ClassroomVisit',
    'CourseApplication', 'AcademyServiceRequest', 'AcademyNotice',
    'AuditEvent', 'CourseSkill', 'SkillProgress', 'AcademyPolicy',
    'WritingTemplate', 'WritingTask', 'WritingAttempt'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', app_table);
    FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', app_table, api_role);
      END IF;
    END LOOP;
  END LOOP;

  -- Prisma's migration role creates future tables in public. A new table
  -- should not become readable through the Data API without an explicit grant.
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', api_role);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', api_role);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I', api_role);
    END IF;
  END LOOP;
END $$;
