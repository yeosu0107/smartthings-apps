local cosock = require "cosock"
local http = cosock.asyncify "socket.http"
local https = cosock.asyncify "ssl.https"
local ltn12 = require "ltn12"
local json = require "dkjson"
local socket_url = require "socket.url"
local log = require "log"
local Driver = require "st.driver"
local capabilities = require "st.capabilities"

local bus_message_cap = capabilities["waterabout01957.busmessage"]

local BROKER_BASE_URL = "https://edge-driver-oauth-broker.netlify.app/api"
local ST_API_BASE     = "https://api.smartthings.com/v1"
local TOKEN_FIELD     = "st_token"
local TOKEN_LEEWAY    = 60

local function clean_bus_msg(raw_msg)
    if not raw_msg or raw_msg == "" then
        return nil
    end

    if string.find(raw_msg, "운행종료") then
        return nil
    end

    local cleaned = string.gsub(raw_msg, "%[.-%]", "")
    cleaned = string.gsub(cleaned, "^%s*(.-)%s*$", "%1")
    return cleaned
end

local function arrival_suffix(msg)
    if string.find(msg, "곧 도착") or string.find(msg, "출발대기") then
        return "입니다"
    end
    return " 도착 예정입니다"
end

local function build_message(items)
    local parts = {}
    for _, item in ipairs(items) do
        local bus_name = item.rtNm
        local msg1 = clean_bus_msg(item.arrmsg1)
        local msg2 = clean_bus_msg(item.arrmsg2)

        if msg1 then
            local part
            if msg2 then
                part = string.format("%s번 버스는 먼저 %s, 다음 버스는 %s%s",
                    bus_name, msg1, msg2, arrival_suffix(msg2))
            else
                part = string.format("%s번 버스는 %s%s",
                    bus_name, msg1, arrival_suffix(msg1))
            end
            table.insert(parts, part)
        end
    end

    if #parts > 0 then
        return "현재 정류장의 버스 도착 정보입니다. " .. table.concat(parts, ". ")
    end
    return "현재 운행 중이거나 도착 예정인 버스가 없습니다."
end

local function emit_message(device, text)
    device:emit_event(bus_message_cap.value(text))
end

local function fetch_seoul_bus_info(device)
    local api_key = device.preferences.apiKey
    local ars_id = device.preferences.stationId

    if not api_key or api_key == "" or not ars_id or ars_id == "" then
        log.warn("API Key 또는 ARS-ID 미설정")
        local msg = "API Key 또는 정류소 ID를 설정해주세요."
        emit_message(device, msg)
        return msg
    end

    local url = "http://ws.bus.go.kr/api/rest/stationinfo/getStationByUid"
        .. "?ServiceKey=" .. socket_url.escape(api_key)
        .. "&arsId=" .. socket_url.escape(ars_id)
        .. "&resultType=json"

    local response_body = {}
    local res, code = http.request {
        url = url,
        method = "GET",
        sink = ltn12.sink.table(response_body),
    }

    if not res then
        log.error("HTTP 요청 실패: " .. tostring(code))
        local msg = "버스 정보 조회에 실패했습니다."
        emit_message(device, msg)
        return msg
    end

    if code ~= 200 then
        log.error("API 응답 코드 비정상: " .. tostring(code))
        local msg = "버스 정보 조회에 실패했습니다."
        emit_message(device, msg)
        return msg
    end

    local body_string = table.concat(response_body)
    local data, _, err = json.decode(body_string, 1, nil)

    if not data then
        log.error("JSON 파싱 실패: " .. tostring(err))
        local msg = "버스 정보 응답을 처리할 수 없습니다."
        emit_message(device, msg)
        return msg
    end

    if not data.msgBody or not data.msgBody.itemList then
        log.warn("응답에 itemList 없음")
        local msg = "해당 정류장의 버스 정보가 없습니다."
        emit_message(device, msg)
        return msg
    end

    local message = build_message(data.msgBody.itemList)
    emit_message(device, message)
    log.info("업데이트 성공: " .. message)
    return message
end

local function load_token(device)
    return device:get_field(TOKEN_FIELD)
end

local function save_token(device, token_data)
    device:set_field(TOKEN_FIELD, token_data, { persist = true })
end

local function clear_token(device)
    device:set_field(TOKEN_FIELD, nil, { persist = true })
end

-- POST <broker>/refresh {refresh_token} → SmartThings 토큰 응답을 그대로 받아 정규화.
local function refresh_via_broker(refresh_token)
    if not refresh_token or refresh_token == "" then
        return nil, "no_refresh_token"
    end

    local body = json.encode({ refresh_token = refresh_token })
    local resp = {}
    local res, code = https.request {
        url = BROKER_BASE_URL .. "/refresh",
        method = "POST",
        headers = {
            ["Content-Type"]   = "application/json",
            ["Accept"]         = "application/json",
            ["Content-Length"] = tostring(#body),
        },
        source = ltn12.source.string(body),
        sink   = ltn12.sink.table(resp),
    }

    if not res then
        log.error("broker /refresh 호출 실패: " .. tostring(code))
        return nil, "broker_unreachable"
    end

    if code ~= 200 then
        log.error("broker /refresh 응답 코드 비정상: " .. tostring(code))
        return nil, "reauth_required"
    end

    local payload, _, err = json.decode(table.concat(resp), 1, nil)
    if not payload or not payload.access_token then
        log.error("토큰 응답 파싱 실패: " .. tostring(err))
        return nil, "bad_response"
    end

    local expires_in = tonumber(payload.expires_in) or 3600
    return {
        access_token  = payload.access_token,
        refresh_token = payload.refresh_token or refresh_token,
        expires_at    = os.time() + expires_in - TOKEN_LEEWAY,
    }
end

-- 캐시된 토큰이 유효하면 그대로, 아니면 broker로 갱신.
local function ensure_access_token(device)
    local cached = load_token(device)
    if cached and cached.access_token and cached.expires_at and os.time() < cached.expires_at then
        return cached.access_token
    end

    local rt = (cached and cached.refresh_token)
        or device.preferences.refreshToken

    if not rt or rt == "" then
        return nil, "no_refresh_token"
    end

    local fresh, err = refresh_via_broker(rt)
    if not fresh then
        return nil, err
    end

    save_token(device, fresh)
    return fresh.access_token
end

local function send_tts(device, text)
    local speaker_id = device.preferences.speakerDeviceId
    if not speaker_id or speaker_id == "" then
        return
    end

    if not text or text == "" then
        return
    end

    local access_token, err = ensure_access_token(device)
    if not access_token then
        log.warn("access_token 확보 실패: " .. tostring(err))
        if err == "reauth_required" or err == "no_refresh_token" then
            emit_message(device, "SmartThings 재인증이 필요합니다. OAuth broker 사이트에서 다시 발급해 주세요.")
        end
        return
    end

    local body = json.encode({
        commands = {
            {
                component  = "main",
                capability = "speechSynthesis",
                command    = "speak",
                arguments  = { text },
            },
        },
    })

    local resp = {}
    local res, code = https.request {
        url = ST_API_BASE .. "/devices/" .. speaker_id .. "/commands",
        method = "POST",
        headers = {
            ["Authorization"]  = "Bearer " .. access_token,
            ["Content-Type"]   = "application/json",
            ["Accept"]         = "application/json",
            ["Content-Length"] = tostring(#body),
        },
        source = ltn12.source.string(body),
        sink   = ltn12.sink.table(resp),
    }

    if not res then
        log.error("TTS 호출 실패: " .. tostring(code))
        return
    end

    if code == 401 then
        log.warn("TTS 401 — 토큰 캐시 무효화 후 1회 재시도")
        clear_token(device)
        local retry_token = ensure_access_token(device)
        if not retry_token then
            return
        end
        local resp2 = {}
        local _, code2 = https.request {
            url = ST_API_BASE .. "/devices/" .. speaker_id .. "/commands",
            method = "POST",
            headers = {
                ["Authorization"]  = "Bearer " .. retry_token,
                ["Content-Type"]   = "application/json",
                ["Accept"]         = "application/json",
                ["Content-Length"] = tostring(#body),
            },
            source = ltn12.source.string(body),
            sink   = ltn12.sink.table(resp2),
        }
        if code2 ~= 200 then
            log.error("TTS 재시도 실패: " .. tostring(code2))
        end
        return
    end

    if code ~= 200 then
        log.error("TTS 응답 코드 비정상: " .. tostring(code) .. " body=" .. table.concat(resp))
    end
end

local function device_init(driver, device)
    log.info("device_init: " .. tostring(device.id))
end

local function device_added(driver, device)
    log.info("device_added: 초기 조회")
    fetch_seoul_bus_info(device)
end

local function device_info_changed(driver, device, event, args)
    local old = args.old_st_store and args.old_st_store.preferences or {}
    local new = device.preferences

    if old.refreshToken ~= new.refreshToken then
        log.info("refreshToken 변경 감지, 캐시 토큰 무효화")
        clear_token(device)
    end

    if old.apiKey ~= new.apiKey or old.stationId ~= new.stationId then
        log.info("preferences 변경 감지, 재조회")
        fetch_seoul_bus_info(device)
    end
end

local function handle_momentary_push(driver, device, command)
    log.info("momentary push 수신")
    local message = fetch_seoul_bus_info(device)
    if message and message ~= "" then
        send_tts(device, message)
    end
end

local function discovery_handler(driver, _opts, should_continue)
    log.info("discovery 시작")

    if #driver:get_devices() > 0 then
        log.info("이미 생성된 디바이스가 있어 discovery를 종료합니다.")
        return
    end

    driver:try_create_device({
        type = "LAN",
        device_network_id = "seoul-bus-stop-" .. tostring(os.time()),
        label = "Seoul Bus Stop",
        profile = "seoul-bus-stop-alarm",
        manufacturer = "waterabout01957",
        model = "seoul-bus-info",
        vendor_provided_label = "Seoul Bus Stop",
    })
end

local driver_template = {
    discovery = discovery_handler,
    supported_capabilities = {
        capabilities.momentary,
        bus_message_cap,
    },
    lifecycle_handlers = {
        init = device_init,
        added = device_added,
        infoChanged = device_info_changed,
    },
    capability_handlers = {
        [capabilities.momentary.ID] = {
            [capabilities.momentary.commands.push.NAME] = handle_momentary_push,
        },
    },
}

local bus_driver = Driver("BusAlarm_Driver", driver_template)
bus_driver:run()
