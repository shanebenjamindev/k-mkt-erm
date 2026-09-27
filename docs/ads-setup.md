# Meta Ads trong K-MKT Workspace

Trang `/ads` hiển thị dữ liệu quảng cáo Meta ở chế độ đọc: chi tiêu, kết quả,
CPA, ROAS, xu hướng theo ngày và danh sách campaign. Có thể tìm/lọc campaign,
mở chi tiết ở cột bên phải, chọn kỳ 1–31 ngày và xuất CSV. Trang chỉ truy cập
được sau khi đăng nhập K-MKT.

## Cấu hình server

Thêm các biến môi trường vào môi trường chạy Next.js hoặc Vercel:

```env
META_GRAPH_API_VERSION=vXX.X
META_AD_ACCOUNT_ID=1234567890
META_ACCESS_TOKEN=token_co_quyen_ads_read
META_APP_SECRET=optional_app_secret
META_RESULT_ACTION_TYPE=lead
META_REVENUE_ACTION_TYPE=purchase
```

- `META_GRAPH_API_VERSION`: phiên bản Graph API mà ứng dụng Meta của bạn hỗ trợ, ví dụ `vXX.X` chỉ là placeholder; thay bằng phiên bản đang dùng.
- `META_AD_ACCOUNT_ID`: ID tài khoản quảng cáo (có hoặc không có tiền tố `act_`).
- `META_ACCESS_TOKEN`: token server của tài khoản đã được cấp quyền đọc dữ liệu quảng cáo. Quản lý và gia hạn token trong Meta; không đặt vào biến `NEXT_PUBLIC_` hoặc commit vào repository.
- `META_APP_SECRET`: tùy chọn để gửi `appsecret_proof` theo từng request.
- `META_RESULT_ACTION_TYPE`: chọn **chính xác một** giá trị `action_type` trong `actions` của Insights; khi chưa cấu hình, Kết quả và CPA hiển thị N/A.
- `META_REVENUE_ACTION_TYPE`: chọn **chính xác một** giá trị `action_type` trong `action_values`; khi chưa cấu hình, ROAS hiển thị N/A. Chỉ dùng với dữ liệu doanh thu phù hợp.

Giá trị action type tùy theo mục tiêu, sự kiện chuyển đổi và cấu hình tài khoản. Đối chiếu với báo cáo Meta Ads ở cùng tài khoản, ngày, múi giờ và quy gán trước khi chốt. Sau khi đặt biến môi trường, triển khai lại website. Nếu dự án dùng Supabase hay mock dữ liệu local, module này vẫn đọc trực tiếp từ Meta ở server và chưa thêm bảng Ads vào database.

## Ranh giới phiên bản này

- Mỗi môi trường website cấu hình một tài khoản quảng cáo; mọi người có quyền dùng workspace hiện xem cùng tài khoản này.
- Yêu cầu đọc dữ liệu Meta khi tải trang; chưa lưu lịch sử vào database và chưa có lịch đồng bộ tự động. Màn hình hiển thị thời điểm lấy dữ liệu.
- Results và doanh thu dựa trên action type đã chọn. Không cộng reach ngày; tỷ lệ được tính lại từ tổng cùng kỳ. Campaign không có dòng Insights sẽ hiển thị N/A.
- Meta có thể thay đổi số liệu chuyển đổi sau thời điểm tải; đối chiếu cần cùng attribution và ngày theo múi giờ tài khoản.
- Các thao tác thay đổi trạng thái hoặc ngân sách campaign thực hiện tại Meta Ads Manager.

Để mở rộng theo kế hoạch K-MKT Ads, bước tiếp theo là OAuth cho từng tài khoản,
lưu dữ liệu theo ngày bằng migration Supabase, quản lý Creative và cảnh báo.
