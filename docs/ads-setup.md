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

## Báo cáo Fanpage

Trang `/ads` có hai tab: **Fanpage** (mặc định) và **Quảng cáo**. Tab Fanpage
cho phép chọn trang mà kết nối workspace được cấp quyền đọc, chọn kỳ tối đa
31 ngày và xem số người theo dõi/thích trang hiện tại, các chỉ số theo ngày,
bài viết đã xuất bản cùng tổng cảm xúc, bình luận và chia sẻ hiện tại.
Lựa chọn Fanpage được lưu trong trình duyệt.

Thêm `META_PAGES_ACCESS_TOKEN` vào môi trường server: token người dùng được
cấp `pages_show_list`, `pages_read_engagement`, `read_insights`,
`pages_read_user_content` (cảm xúc/bình luận) và quyền truy
cập các trang cần báo cáo. Khi chưa đặt biến này, ứng dụng thử dùng
`META_ACCESS_TOKEN`. Báo cáo Fanpage không yêu cầu `META_AD_ACCOUNT_ID`.
Danh sách trang và Page access token được đọc từ `/me/accounts`; token trang
chỉ dùng trên server, không trả về trình duyệt. Sau khi thay token, khởi động
lại hoặc triển khai lại ứng dụng. Nếu danh sách trống, kiểm tra các trang và
quyền đã cấp cho kết nối trong Meta.

Mỗi chỉ số được gọi riêng để các chỉ số không được phiên bản API hỗ trợ không
làm hỏng cả báo cáo. N/A không được chuyển thành 0. Các giá trị theo ngày được
hiển thị theo ngày; chỉ cộng các chỉ số cộng được, không cộng người dùng duy nhất. Thời điểm kết
thúc kỳ được hiển thị ở UTC; ngày đăng bài viết dùng múi giờ trình duyệt.
Giới hạn 1.000 bài viết/kỳ; báo cáo cảnh báo khi danh sách bị cắt. Số liệu tương
tác chi tiết tải cho tối đa 50 bài đầu tiên, các bài còn lại hiển thị N/A.
Mọi thành viên có quyền `ads.read` xem cùng các trang được kết nối với workspace.

### Bộ lọc và trạng thái dữ liệu

Báo cáo kiểm tra quyền qua `/me/permissions` khi token cho phép. Nếu thiếu
`read_insights`, giao diện báo thiếu quyền thay vì diễn giải danh sách rỗng là
không có hoạt động. Cảm xúc, bình luận và chia sẻ được gọi riêng để lỗi của một
trường không làm mất trường khác. Trạng thái chỉ số phân biệt có dữ liệu,
danh sách rỗng, thiếu quyền, không hỗ trợ và lỗi kết nối.

Thư viện bài viết dùng thumbnail từ `full_picture` hoặc ảnh của attachment,
phân biệt ảnh, video/reel, liên kết và văn bản. Có tìm kiếm nội dung/ID, lọc loại
nội dung và số liệu tương tác, sắp xếp theo ngày hoặc từng tương tác, cùng phân
trang 6/12/24/48 bài. Khoảng ngày bài viết dùng múi giờ Việt Nam; nút Áp dụng
tránh tải lại khi người dùng đang sửa ngày. Các mốc nhanh 7/14/30 ngày áp dụng
ngay. Dấu “—” biểu thị chưa đọc được; lỗi quyền đi kèm từng số liệu.

Kiểm tra logic bằng `sh scripts/test-meta-pages.sh`.

### Xác thực báo cáo

`/ads` kiểm tra phiên K-MKT trên server trước khi dựng giao diện. Người chưa
đăng nhập được chuyển tới `/login?next=%2Fads`; đăng nhập thành công quay lại
báo cáo. Giá trị `next` chỉ chấp nhận `/ads`, tránh chuyển hướng tới website
bên ngoài. Tài khoản bắt buộc đổi mật khẩu được chuyển tới trang hồ sơ.

Cả API quảng cáo và Fanpage kiểm tra phiên và `ads.read` ở từng yêu cầu,
đồng thời trả `Cache-Control: private, no-store`. Khi API trả 401, giao diện
chuyển lại trang đăng nhập. Admin và employee hiện có `ads.read`; cơ chế này
xác thực tài khoản K-MKT và vẫn dùng kết nối Meta chung của workspace, chưa
phải Facebook OAuth riêng cho từng người.
