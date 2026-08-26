<?php

namespace App\Modules\Operations\Presentation\Http\Requests;

use App\Modules\Operations\Infrastructure\Persistence\Models\InternalNotification;
use Illuminate\Foundation\Http\FormRequest;

class MarkNotificationReadRequest extends FormRequest
{
    public function authorize(): bool
    {
        $notification = $this->route('notification');

        return $notification instanceof InternalNotification
            && $notification->usuario_id === $this->user()?->id;
    }

    /** @return array<string, list<string>> */
    public function rules(): array
    {
        return [];
    }
}
