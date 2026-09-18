# K-MKT Workspace

Ứng dụng quản lý công việc Marketing với dashboard, task, lịch sản xuất, brief, nhân viên và hồ sơ tài khoản. Các màn hình dùng chung một nguồn dữ liệu nên thay đổi task hoặc thành viên được cập nhật xuyên suốt workspace.

## Chạy local

```bash
npm install
npm run dev
```

Mở [http://localhost:3000](http://localhost:3000). Lần chạy đầu tiên hiển thị form để tạo tài khoản quản trị của riêng bạn. Không có tài khoản hay mật khẩu mẫu được tạo sẵn.

Trong chế độ phát triển hiện tại, dữ liệu được lưu trong `.data/workspace.json` và mật khẩu được băm bằng scrypt; đây là mock server-side cho local development, không phải cơ chế xác thực production. Tệp `.data` được bỏ qua khỏi Git để dữ liệu không bị commit.

## Tài khoản và quyền

- Tài khoản mới có `mustChangePassword = true`.
- Sau lần đăng nhập đầu tiên, người dùng được chuyển đến **Tài khoản** và phải đặt mật khẩu tối thiểu 8 ký tự trước khi dùng workspace.
- Mật khẩu không được hiển thị hoặc lưu dạng văn bản thuần.
- Quản trị viên mới thấy trang **Nhân viên** và có thể CRUD thành viên.

## Backend API

- `GET` / `POST` `/api/tasks`
- `PATCH` / `DELETE` `/api/tasks/:id`
- `GET` / `POST` `/api/team`
- `PATCH` / `DELETE` `/api/team/:id`
- `PATCH` `/api/profile`
- `POST` `/api/auth/setup`, `/api/auth/login`, `/api/auth/logout`
- `GET` `/api/auth/me`

## Đánh giá sức tải team

Trang Team và dashboard tự đánh giá theo mỗi người: task đang mở, deadline trong 2 ngày, task trễ hạn và tỷ lệ hoàn thành. Ngưỡng mặc định là **5 task chưa hoàn thành/người**; có thể thay đổi tại `ACTIVE_TASK_CAPACITY` trong `lib/workload.ts`.

## Thông báo và iPhone

Ứng dụng có thể cài trực tiếp trên iPhone như một PWA, không cần đổi giao diện: mở website bằng Safari, chọn **Chia sẻ → Thêm vào Màn hình chính**, mở app từ icon mới tạo và bấm chuông **Bật noti iPhone**.

- Khi task được giao, người phụ trách nhận được thông báo trong app; thiết bị đã đăng ký sẽ nhận push notification.
- Endpoint `GET` hoặc `POST` `/api/notifications/remind` tạo reminder cho task đến hạn/quá hạn. Hãy gọi endpoint này mỗi ngày bằng cron của nền tảng deploy, kèm header `Authorization: Bearer <CRON_SECRET>`.
- Push nền chỉ hoạt động trên HTTPS và sau khi app được thêm vào Màn hình chính trên iOS 16.4 trở lên.

Tạo VAPID keys một lần rồi điền vào `.env.local` (không commit private key):

```bash
npx web-push generate-vapid-keys
```

Điền `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` và `CRON_SECRET`. Nếu chưa có các biến này, chuông vẫn hiển thị thông báo trong app nhưng push nền sẽ báo chưa cấu hình.

## Supabase khi triển khai production

Schema ở [`supabase/schema.sql`](./supabase/schema.sql) dùng `auth.users` làm nguồn xác thực và không có cột password hoặc seed account. App tự dùng Supabase Auth/database khi đủ biến môi trường: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` và `SUPABASE_SECRET_KEY` (server-only, bắt đầu bằng `sb_secret_`). Khi đó đăng nhập dùng Supabase Auth, đổi mật khẩu dùng `updateUser`, và `must_change_password` vẫn được lưu ở `team_members`. Không đưa secret key hoặc mật khẩu vào client.

Nếu thiếu server key, app chỉ dùng kho `.data/workspace.json` cho demo/local development; không dùng chế độ này trên Vercel.

```bash
npm run build
npm start
```
# k-mkt-erm
