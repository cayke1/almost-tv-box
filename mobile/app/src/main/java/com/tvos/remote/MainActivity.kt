package com.tvos.remote

import android.content.Context
import android.net.wifi.WifiManager
import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.google.gson.Gson
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException

class MainActivity : ComponentActivity() {
    private lateinit var discoveryManager: DiscoveryManager
    private var multicastLock: WifiManager.MulticastLock? = null
    private val client = OkHttpClient()
    private val gson = Gson()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Acquire multicast lock for NSD
        val wifi = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
        multicastLock = wifi.createMulticastLock("TVOSRemoteMulticastLock")
        multicastLock?.setReferenceCounted(true)
        multicastLock?.acquire()
        
        val serverIp = mutableStateOf<String?>(null)
        val serverPort = mutableStateOf(8080)
        val isConnected = mutableStateOf(false)

        discoveryManager = DiscoveryManager(this) { host, port ->
            serverIp.value = host
            serverPort.value = port
            isConnected.value = true
            Log.d("Remote", "Connected to $host:$port")
        }

        setContent {
            MaterialTheme(
                colorScheme = darkColorScheme(
                    primary = Color(0xFF3B82F6),
                    background = Color(0xFF0A0A0A),
                    surface = Color(0xFF1A1A1A)
                )
            ) {
                RemoteScreen(
                    isConnected = isConnected.value,
                    serverHost = serverIp.value,
                    onCommand = { type, payload ->
                        val host = serverIp.value
                        if (host != null) {
                            sendCommand(host, serverPort.value, type, payload)
                        }
                    }
                )
            }
        }

        discoveryManager.startDiscovery()
    }

    override fun onDestroy() {
        super.onDestroy()
        discoveryManager.stopDiscovery()
        multicastLock?.release()
    }

    private fun sendCommand(host: String, port: Int, type: String, payload: Map<String, Any>) {
        val url = "http://$host:$port/api/command"
        val bodyMap = mapOf(
            "clientId" to "mobile-remote",
            "type" to type,
            "payload" to payload
        )
        val json = gson.toJson(bodyMap)
        val body = json.toRequestBody("application/json".toMediaType())
        val request = Request.Builder().url(url).post(body).build()

        client.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                Log.e("Remote", "Failed to send command: ${e.message}")
            }
            override fun onResponse(call: Call, response: Response) {
                Log.d("Remote", "Command sent: ${response.code}")
                response.close()
            }
        })
    }
}

@Composable
fun RemoteScreen(
    isConnected: Boolean,
    serverHost: String?,
    onCommand: (String, Map<String, Any>) -> Unit
) {
    var showKeyboardDialog by remember { mutableStateOf(false) }
    var textInput by remember { mutableStateOf("") }

    if (showKeyboardDialog) {
        AlertDialog(
            onDismissRequest = { showKeyboardDialog = false },
            title = { Text("Keyboard Input") },
            text = {
                TextField(
                    value = textInput,
                    onValueChange = { textInput = it },
                    placeholder = { Text("Type something...") },
                    modifier = Modifier.fillMaxWidth()
                )
            },
            confirmButton = {
                Button(onClick = {
                    onCommand("TEXT_INPUT", mapOf("text" to textInput))
                    textInput = ""
                    showKeyboardDialog = false
                }) {
                    Text("Send")
                }
            },
            dismissButton = {
                TextButton(onClick = { showKeyboardDialog = false }) {
                    Text("Cancel")
                }
            }
        )
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF0A0A0A))
            .padding(20.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        // --- Header Section ---
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = "TV-OS",
                color = Color.White,
                fontSize = 24.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 4.sp
            )
            Spacer(modifier = Modifier.height(8.dp))
            Surface(
                color = if (isConnected) Color(0xFF22C55E).copy(alpha = 0.1f) else Color(0xFFEF4444).copy(alpha = 0.1f),
                shape = RoundedCornerShape(20.dp),
                border = ButtonDefaults.outlinedButtonBorder
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(
                        modifier = Modifier
                            .size(6.dp)
                            .clip(CircleShape)
                            .background(if (isConnected) Color(0xFF22C55E) else Color(0xFFEF4444))
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = if (isConnected) "Connected: $serverHost" else "Searching TV...",
                        color = if (isConnected) Color(0xFF22C55E) else Color(0xFFEF4444),
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Medium
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(24.dp))

        // --- Touchpad Section ---
        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .height(180.dp)
                .clip(RoundedCornerShape(24.dp))
                .pointerInput(Unit) {
                    detectDragGestures(
                        onDragStart = { onCommand("TOUCH_START", emptyMap()) },
                        onDragEnd = { onCommand("TOUCH_END", emptyMap()) },
                        onDrag = { change, dragAmount ->
                            change.consume()
                            onCommand("MOUSE_MOVE", mapOf(
                                "dx" to dragAmount.x / 2f,
                                "dy" to dragAmount.y / 2f
                            ))
                        }
                    )
                }
                .clickable { onCommand("MOUSE_CLICK", mapOf("button" to "left")) },
            color = Color(0xFF151515),
            shape = RoundedCornerShape(24.dp),
            border = ButtonDefaults.outlinedButtonBorder
        ) {
            Box(contentAlignment = Alignment.Center) {
                Text(
                    "TOUCHPAD",
                    color = Color.White.copy(alpha = 0.1f),
                    fontWeight = FontWeight.Black,
                    fontSize = 32.sp
                )
            }
        }

        Spacer(modifier = Modifier.weight(1f))

        // --- Controls Section ---
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceEvenly,
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Volume Column
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                RemoteButton(Icons.Default.VolumeUp, "Vol +", size = 60.dp) { onCommand("VOLUME_UP", emptyMap()) }
                Spacer(modifier = Modifier.height(12.dp))
                RemoteButton(Icons.Default.VolumeDown, "Vol -", size = 60.dp) { onCommand("VOLUME_DOWN", emptyMap()) }
            }

            // D-Pad
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                RemoteButton(Icons.Default.KeyboardArrowUp, "UP") { onCommand("NAVIGATION", mapOf("direction" to "up")) }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    RemoteButton(Icons.Default.KeyboardArrowLeft, "LEFT") { onCommand("NAVIGATION", mapOf("direction" to "left")) }
                    Surface(
                        modifier = Modifier
                            .size(70.dp)
                            .clip(CircleShape)
                            .clickable { onCommand("SELECT", emptyMap()) },
                        color = Color(0xFF3B82F6),
                        shape = CircleShape
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Text("OK", color = Color.White, fontWeight = FontWeight.Bold)
                        }
                    }
                    RemoteButton(Icons.Default.KeyboardArrowRight, "RIGHT") { onCommand("NAVIGATION", mapOf("direction" to "right")) }
                }
                RemoteButton(Icons.Default.KeyboardArrowDown, "DOWN") { onCommand("NAVIGATION", mapOf("direction" to "down")) }
            }

            // Utils Column
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                RemoteButton(Icons.Default.Edit, "KB", size = 60.dp) { showKeyboardDialog = true }
                Spacer(modifier = Modifier.height(12.dp))
                RemoteButton(Icons.Default.VolumeMute, "Mute", size = 60.dp) { onCommand("VOLUME_MUTE", emptyMap()) }
            }
        }

        Spacer(modifier = Modifier.weight(1f))

        // --- Navigation Footer ---
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // BACK Button
            Surface(
                modifier = Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(20.dp))
                    .clickable { onCommand("BACK", emptyMap()) },
                color = Color(0xFF1A1A1A),
                shape = RoundedCornerShape(20.dp),
                border = ButtonDefaults.outlinedButtonBorder
            ) {
                Row(
                    modifier = Modifier.padding(vertical = 14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center
                ) {
                    Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = Color.Gray)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("BACK", color = Color.Gray, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                }
            }

            // HOME Button
            Surface(
                modifier = Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(20.dp))
                    .clickable { onCommand("HOME", emptyMap()) },
                color = Color(0xFF1A1A1A),
                shape = RoundedCornerShape(20.dp),
                border = ButtonDefaults.outlinedButtonBorder
            ) {
                Row(
                    modifier = Modifier.padding(vertical = 14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center
                ) {
                    Icon(Icons.Default.Home, contentDescription = "Home", tint = Color.White)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("HOME", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                }
            }
        }
    }
}

@Composable
fun RemoteButton(
    icon: ImageVector, 
    label: String, 
    size: androidx.compose.ui.unit.Dp = 70.dp,
    onClick: () -> Unit
) {
    Surface(
        modifier = Modifier
            .size(size)
            .padding(4.dp)
            .clip(RoundedCornerShape(16.dp))
            .clickable { onClick() },
        color = Color(0xFF1A1A1A),
        shape = RoundedCornerShape(16.dp)
    ) {
        Box(contentAlignment = Alignment.Center) {
            Icon(
                imageVector = icon,
                contentDescription = label,
                tint = Color.White,
                modifier = Modifier.size(28.dp)
            )
        }
    }
}
