import asyncio
import json
import websockets
import os

# قاموس لتخزين الغرف والمشتركين فيها
# البنية: { room_id: { "owner": websocket, "guests": [websocket, ...] } }
rooms = {}

async def handler(websocket, path):
    # استخراج اسم الغرفة من الرابط (المسار المتوقع: /room/room_id)
    path_parts = path.strip("/").split("/")
    if len(path_parts) < 2 or path_parts[0] != "room":
        await websocket.close()
        return

    room_id = path_parts[1]

    # إنشاء الغرفة إذا لم تكن موجودة وتعيين أول داخل كـ Owner
    if room_id not in rooms:
        rooms[room_id] = {"owner": websocket, "guests": []}
        my_role = "owner"
        print(f"[غرفة {room_id}]: تم إنشاؤها بواسطة المالك.")
    else:
        rooms[room_id]["guests"].append(websocket)
        my_role = "guest"
        print(f"[غرفة {room_id}]: انضم ضيف جديد.")

    # إرسال الدور الحالي (owner أو guest) للمستخدم فور اتصاله
    await websocket.send(json.dumps({
        "type": "role",
        "role": my_role
    }))

    # إذا انضم ضيف، نرسل تنبيه للمالك لبدء عملية الربط (WebRTC Signaling)
    if my_role == "guest" and rooms[room_id]["owner"]:
        await rooms[room_id]["owner"].send(json.dumps({
            "type": "guest-joined"
        }))

    try:
        # استقبال الرسائل وتوجيهها للطرف الآخر داخل الغرفة
        async for message in websocket:
            data = json.loads(message)
            
            if my_role == "owner":
                # المالك يرسل الإشارات أو الشات لجميع الضيوف
                for guest in rooms[room_id]["guests"]:
                    await guest.send(json.dumps(data))
            else:
                # الضيف يرسل الإشارات أو الشات للمالك فقط
                if rooms[room_id]["owner"]:
                    await rooms[room_id]["owner"].send(json.dumps(data))

    except websockets.exceptions.ConnectionClosed:
        print(f"[غرفة {room_id}]: انقطع اتصال أحد الأطراف.")
    finally:
        # تنظيف الغرفة عند خروج المستخدمين
        if room_id in rooms:
            if my_role == "owner":
                print(f"[غرفة {room_id}]: المالك غادر، يتم إغلاق الغرفة.")
                # إعلام الضيوف بإغلاق الغرفة
                for guest in rooms[room_id]["guests"]:
                    await guest.close()
                rooms.pop(room_id, None)
            else:
                if websocket in rooms[room_id]["guests"]:
                    rooms[room_id]["guests"].remove(websocket)
                print(f"[غرفة {room_id}]: غادر أحد الضيوف.")
                # إذا أصبحت الغرفة فارغة تماماً يتم حذفها
                if not rooms[room_id]["guests"] and not rooms[room_id]["owner"]:
                    rooms.pop(room_id, None)

async def main():
    # قراءة البورت من بيئة تشغيل Render، وإذا لم يوجد يستخدم 8080 الافتراضي محلياً
    port = int(os.environ.get("PORT", 8080))
    
    # تشغيل السيرفر على العنوان "0.0.0.0" ليقبل الاتصالات الخارجية والداخلية
    async with websockets.serve(handler, "0.0.0.0", port):
        print(f"سيرفر البث يعمل الآن بنجاح على البورت: {port} ...")
        await asyncio.Future()  # الحفاظ على السيرفر يعمل دائماً دون توقف

if name == "__main__":
    asyncio.run(main())