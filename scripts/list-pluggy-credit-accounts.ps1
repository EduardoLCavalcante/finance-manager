param(
  [Parameter(Mandatory = $true)]
  [string[]]$ItemIds
)

$clientId = Read-Host "Pluggy Client ID"
$secret = Read-Host "Pluggy Client Secret" -AsSecureString
$clientSecret = [System.Net.NetworkCredential]::new("", $secret).Password

$auth = Invoke-RestMethod `
  -Uri "https://api.pluggy.ai/auth" `
  -Method Post `
  -ContentType "application/json" `
  -Body (@{
    clientId = $clientId
    clientSecret = $clientSecret
  } | ConvertTo-Json)

Remove-Variable clientSecret

foreach ($itemId in $ItemIds) {
  $url = "https://api.pluggy.ai/accounts?itemId=$([uri]::EscapeDataString($itemId))&type=CREDIT"

  try {
    $response = Invoke-RestMethod `
      -Uri $url `
      -Headers @{ "X-API-KEY" = $auth.apiKey }

    foreach ($account in $response.results) {
      [PSCustomObject]@{
        ItemId = $itemId
        AccountId = $account.id
        Nome = $account.name
        Tipo = $account.type
      }
    }
  } catch {
    Write-Warning "Falha ao consultar o item: $($_.Exception.Message)"
  }
}
