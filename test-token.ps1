$body = @{
    room = "test-room"
    identity = "user-4216"
} | ConvertTo-Json

$response = Invoke-RestMethod -Uri 'http://localhost:3001/token' -Method POST -Body $body -ContentType 'application/json'
Write-Output "Response:"
Write-Output ($response | ConvertTo-Json)
Write-Output "`nToken:"
Write-Output $response.token
