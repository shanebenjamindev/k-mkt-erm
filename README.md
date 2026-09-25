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
- Endpoint `GET` hoặc `POST` `/api/notifications/remind` tạo reminder cho task đến hạn/quá hạn và thực thi lịch nhắc đã đặt. Cron trong `vercel.json` gọi mỗi phút với header `Authorization: Bearer <CRON_SECRET>`; nền tảng triển khai cần hỗ trợ tần suất này để gửi đúng giờ.
- Push nền chỉ hoạt động trên HTTPS và sau khi app được thêm vào Màn hình chính trên iOS 16.4 trở lên.

Tạo VAPID keys một lần rồi điền vào `.env.local` (không commit private key):

```bash
npx web-push generate-vapid-keys
```

Điền `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` và `VAPID_SUBJECT` vào môi trường server; tên cũ `NEXT_PUBLIC_VAPID_PUBLIC_KEY` vẫn được hỗ trợ. Hai khóa phải cùng một cặp. Thiết lập riêng các biến này cho Vercel Production rồi triển khai lại; chỉ chỉnh `.env.local` không ảnh hưởng server Vercel. `CRON_SECRET` dùng cho cron reminder, không cần để bật push. Không thay cặp khóa production đang dùng nếu thiết bị đã đăng ký. Nếu thiếu khóa, thông báo trong app vẫn hoạt động nhưng push sẽ báo chưa cấu hình.

## Supabase khi triển khai production

Schema ở [`supabase/schema.sql`](./supabase/schema.sql) dùng `auth.users` làm nguồn xác thực và không có cột password hoặc seed account. App tự dùng Supabase Auth/database khi đủ biến môi trường: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` và `SUPABASE_SECRET_KEY` (server-only, bắt đầu bằng `sb_secret_`). Khi đó đăng nhập dùng Supabase Auth, đổi mật khẩu dùng `updateUser`, và `must_change_password` vẫn được lưu ở `team_members`. Không đưa secret key hoặc mật khẩu vào client.

Nếu thiếu server key, app chỉ dùng kho `.data/workspace.json` cho demo/local development; không dùng chế độ này trên Vercel.

```bash
npm run build
npm start
```
# k-mkt-erm


## Giao diện kính và đồng bộ công việc/thông báo

- Theme đỏ–trắng ở `app/glass.css`, dùng nền gradient, kính bán trong suốt, blur và chế độ giảm chuyển động. Giữ màu trạng thái để phân biệt tiến độ.
- Badge công việc tính từ cùng nguồn `WorkspaceProvider` với danh sách: mọi task khác `completed`, không phụ thuộc bộ lọc. Thay đổi trạng thái cập nhật ngay và khôi phục khi API lỗi; số 0 được ẩn, trên 99 hiển thị `99+` (nhãn truy cập vẫn có tổng đầy đủ).
- Workspace và thông báo tải nền mỗi 30 giây khi tab đang hiển thị, khi trở lại tab hoặc có mạng. Thay đổi trong tab khác được đồng bộ qua sự kiện storage. Đây là polling, không phải WebSocket.
- Tab hiển thị `(n) K-MKT Workspace` theo tổng chưa đọc trên server, kể cả thông báo nằm ngoài 40 mục gần nhất. “Đọc tất cả” xử lý toàn bộ thông báo của tài khoản.
- `POST /api/notifications/:id/remind` gửi lại thông báo của chính người đang đăng nhập, đặt lại chưa đọc và dùng push nếu đã cấu hình. Cooldown 120 giây được kiểm tra nguyên tử phía server, trả HTTP 429 kèm `Retry-After`. Giữ nguyên endpoint cron `/api/notifications/remind`.

**Supabase đang chạy:** áp dụng `supabase/migrations/20260925_notification_reminders.sql` trước khi deploy code. Migration thêm `reminded_at` cho nút nhắc lại và RPC tùy chọn. Việc tải thông báo hoạt động trực tiếp với bảng Supabase hiện có, kể cả khi chưa áp dụng migration. File đã được chuẩn bị trong repository; chưa áp dụng vào database đang chạy. Local JSON không cần migration. Kho local được tuần tự hóa trong một tiến trình; production nhiều instance cần Supabase.

Kiểm tra:

```bash
npm run test:calendar
npm run test:workspace
npx tsc --noEmit
npm run build
```

`test:workspace` tạo dữ liệu trong thư mục tạm và không dùng credentials Supabase. Kiểm tra HTTP bổ sung: `node scripts/tests/http-smoke.cjs http://127.0.0.1:3107`, **chỉ chạy với một bản app sao chép riêng, không có `.env.local`/`.data` và chưa có tài khoản**; script tạo tài khoản QA và dữ liệu thử.

## Nhiều người phụ trách trên một task

Task lưu danh sách `assigneeIds`; form tạo/sửa cho chọn nhiều nhân viên, lọc và đánh giá sức tải theo từng người. In-house/Outsource là **loại công việc**, được chọn độc lập trên task. Trường `team_members.work_type` cũ được giữ trong database để tương thích dữ liệu, nhưng không còn được dùng để phân loại nhân viên trong giao diện hoặc tự đổi loại task.

Với Supabase production, áp dụng [`supabase/migrations/20260925_task_assignees.sql`](./supabase/migrations/20260925_task_assignees.sql) **trước khi triển khai mã mới**. Migration thêm `tasks.assignee_ids` và chuyển task một người cũ sang ID nhân viên tương ứng. Nếu trước đây có nhiều nhân viên trùng tên, cần kiểm tra lại phân công của các task cũ sau migration vì cột tên cũ không đủ thông tin để phân biệt họ. Local JSON được nâng cấp tự động khi đọc.

Task có thể đặt ngày, giờ nhắc và lặp một lần/mỗi ngày/mỗi tuần tới hạn task; task hoàn thành sẽ không được nhắc. Trong trung tâm thông báo, “Nhắc nhở lại” cho gửi ngay hoặc đặt lịch lặp riêng cho thông báo đó. Áp dụng thêm [`supabase/migrations/20260925_scheduled_reminders.sql`](./supabase/migrations/20260925_scheduled_reminders.sql) trước khi triển khai. Lịch vẫn tạo thông báo trong app khi push chưa được cấu hình; push chỉ được gửi tới thiết bị đã đăng ký.
Khi người dùng đang mở app, trung tâm thông báo kiểm tra lịch đến hạn mỗi 30 giây qua endpoint đăng nhập `/api/notifications/check`. Để gửi lúc mọi người đã đóng app, vẫn cần cron chạy trên server cùng `CRON_SECRET`; bản local không tự khởi chạy cron. Nếu nền tảng chỉ hỗ trợ cron mỗi ngày thì không thể đảm bảo gửi đúng giờ khi app đóng.

Form tạo/sửa task hỗ trợ tối đa 5 mốc thông báo trước giờ bắt đầu (phút/giờ/ngày), ngoài lịch ngày giờ cụ thể sẵn có. Áp dụng [`supabase/migrations/20260925_relative_task_reminders.sql`](./supabase/migrations/20260925_relative_task_reminders.sql) trước khi triển khai. Trang **Cài đặt dự án** cho quản trị viên đổi màu chủ đạo, nền và âm thanh thông báo dùng chung; áp dụng thêm [`supabase/migrations/20260925_project_settings.sql`](./supabase/migrations/20260925_project_settings.sql). Nền riêng được giới hạn 750 KB để giữ tải trang nhanh.
