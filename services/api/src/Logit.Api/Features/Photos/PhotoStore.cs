using Amazon.Runtime;
using Amazon.S3;
using Amazon.S3.Model;

namespace Logit.Api.Features.Photos;

/// Where photo files live, by key (the photo's id).
public interface IPhotoStore
{
    Task PutAsync(string key, byte[] bytes, string contentType, CancellationToken ct);
    /// Null when there's no such file.
    Task<Stream?> OpenAsync(string key, CancellationToken ct);
    Task DeleteAsync(string key, CancellationToken ct);
}

/// A folder on the server's disk: the default, and what self-hosted servers use
/// (Photos:Folder, /data/photos in docker-compose.yml, next to the database).
public class FolderPhotoStore(string folder) : IPhotoStore
{
    private string PathOf(string key) => Path.Combine(folder, key[..2], key);

    public async Task PutAsync(string key, byte[] bytes, string contentType, CancellationToken ct)
    {
        var path = PathOf(key);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        await File.WriteAllBytesAsync(path, bytes, ct);
    }

    public Task<Stream?> OpenAsync(string key, CancellationToken ct) =>
        Task.FromResult<Stream?>(File.Exists(PathOf(key)) ? File.OpenRead(PathOf(key)) : null);

    public Task DeleteAsync(string key, CancellationToken ct)
    {
        File.Delete(PathOf(key));
        return Task.CompletedTask;
    }
}

/// An S3-compatible bucket: Cloudflare R2 on getlogit.app. Config: Photos:S3:ServiceUrl
/// (https://<account>.r2.cloudflarestorage.com), Photos:S3:Bucket, Photos:S3:AccessKey, Photos:S3:SecretKey.
public class S3PhotoStore : IPhotoStore
{
    private readonly AmazonS3Client _s3;
    private readonly string _bucket;
    private readonly bool _https;

    public S3PhotoStore(string serviceUrl, string bucket, string accessKey, string secretKey)
    {
        _bucket = bucket;
        _https = serviceUrl.StartsWith("https:", StringComparison.OrdinalIgnoreCase);
        _s3 = new AmazonS3Client(new BasicAWSCredentials(accessKey, secretKey), new AmazonS3Config
        {
            ServiceURL = serviceUrl,
            ForcePathStyle = true,
            AuthenticationRegion = "auto",
            // R2 doesn't take the SDK's default checksum trailers.
            RequestChecksumCalculation = RequestChecksumCalculation.WHEN_REQUIRED,
            ResponseChecksumValidation = ResponseChecksumValidation.WHEN_REQUIRED,
        });
    }

    public async Task PutAsync(string key, byte[] bytes, string contentType, CancellationToken ct)
    {
        using var body = new MemoryStream(bytes);
        await _s3.PutObjectAsync(new PutObjectRequest
        {
            BucketName = _bucket, Key = key, InputStream = body, ContentType = contentType,
            // R2 wants unsigned payloads; the SDK allows that only over HTTPS (a local test bucket may be plain HTTP).
            DisablePayloadSigning = _https,
        }, ct);
    }

    public async Task<Stream?> OpenAsync(string key, CancellationToken ct)
    {
        try
        {
            var res = await _s3.GetObjectAsync(_bucket, key, ct);
            return res.ResponseStream;
        }
        catch (AmazonS3Exception e) when (e.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return null;
        }
    }

    public Task DeleteAsync(string key, CancellationToken ct) => _s3.DeleteObjectAsync(_bucket, key, ct);
}
