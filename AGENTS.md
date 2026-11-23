# Hướng dẫn làm việc

- Chủ yếu sửa lỗi, cải tiến chức năng giao diện, tập trung vào độ chính xác cao và tính ổn định.
- Logic theo hướng hiện đại và con người.
- Sau khi sửa, luôn chạy localhost và mở trong trình duyệt để người dùng kiểm tra. Nếu máy chủ đã chạy, tái sử dụng hoặc khởi động lại khi cần để phục vụ mã mới. Giữ localhost chạy sau khi hoàn thành, trừ khi người dùng yêu cầu dừng.
- Máy chủ cần kết nối HTTPS tới nguồn HoanNguyen. Nếu gặp `connect EACCES` trong sandbox, dùng cơ chế phê duyệt quyền mạng để khởi động máy chủ ngoài sandbox và xác minh API nguồn thực tế. Không coi token đã lưu là bằng chứng kết nối thành công.
- Admin phải được nạp ví CTV và CTV được đặt đơn trên Render Free. Không tự khóa các chức năng này chỉ vì dùng lưu trữ tạm hoặc chưa có persistent disk. Ví CTV là số dư nội bộ ebongiu; chi phí nguồn được thanh toán qua tài khoản HoanNguyen khi tạo đơn. Giữ phân quyền, chống trùng, kiểm tra số dư và giám sát giao dịch.
