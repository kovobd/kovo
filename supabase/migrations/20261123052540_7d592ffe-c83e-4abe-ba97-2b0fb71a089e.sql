DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();

INSERT INTO public.profiles (user_id, email, full_name)
SELECT
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data ->> 'full_name', split_part(u.email, '@', 1))
FROM auth.users u
WHERE u.id = '319eaea3-3fa9-40b8-a806-d9cd82a9c713'::uuid
ON CONFLICT (user_id) DO NOTHING;